'use strict';
var _ = require('lodash');
var collectionHelper = require('./collection');
var slug = require('slug')

var mergeInternalAggregations = function(aggregations) {
  _.forEach(_.keys(aggregations), function(key) {
    var index = key.indexOf('_internal_count')
    if (index !== -1) {
      var found_key = key.split('_internal_count')[0]

      if (aggregations[found_key] && aggregations[key]['value']) {
        aggregations[found_key]['total'] = aggregations[key]['value']
      }
      delete aggregations[key]
    }
  })

  return aggregations
}

var getAggregationsResponse = function(collection_aggregations, result_aggregations) {

  //console.log(collection_aggregations);
  //console.log(result_aggregations);
  // object response
  return _.extend(_.clone(result_aggregations), _.mapValues(result_aggregations, function(v, k) {
    // supports filters in aggregations
    if (!v.buckets && v[k]) {
      _.extend(v, v[k]);
      delete v[k];
    }

    v = _.omit(v, [
      'sum_other_doc_count',
      'doc_count_error_upper_bound',
      //'doc_count'
    ])

    return _.extend(v, {
      title: collection_aggregations[k].title || k,
      name: k,
      position: parseInt(collection_aggregations[k].position || 0, 10),
      size: parseInt(collection_aggregations[k].size, 10),
      type: collection_aggregations[k].type
    });
  }))

}

var getAggregationsFacetsResponse = function(collection_aggregations, result_aggregations) {
  var aggregations = getAggregationsResponse(collection_aggregations, result_aggregations);

  aggregations = _.chain(aggregations)
  .filter({type: 'terms'})
  .map(function(val) {
    //console.log(val);
    return _.omit(val, ['sum_other_doc_count', 'doc_count_error_upper_bound'])
  })
  .map(function(val) {
    val.buckets = _.map(val.buckets, function(val2) {
      val2.permalink = slug(val2.key, {lower: true});
      return val2;
    })
    return val;
  })
  .value();

  return aggregations;
}

var facetsConverter = function(input, collection, result) {
  var helper = collectionHelper(collection);
  return getAggregationsFacetsResponse(
    helper.getAggregations(),
    result.data.aggregations
  )
}

var searchConverter = function(input, collection, data) {
  var helper = collectionHelper(collection);

  var items = _.map(data.hits.hits, function(doc) {
    return _.extend(
      //{id: doc._id, score: doc._score},
      {id: doc._id},
      doc._source, doc.fields
    );
  })

  var sortings = _.mapValues(helper.getSortings(), function(v, k) {
    return {
      name: k,
      order: v.order,
      title: v.title
    };
  })

  return {
    meta: {
      query: input.query,
      sort: helper.getChosenSortingKey(input.sort) || ''
    },
    pagination: {
      page: parseInt(input.page) || 1,
      per_page: parseInt(input.per_page) || 16,
      total: data.hits.total
    },
    data: {
      items: items,
      aggregations: getAggregationsResponse(
        helper.getAggregations(),
        data.aggregations
      ),
      //sortings: sortings
    }
  }
}

var similarConverter = function(input, data) {
  var helper = collectionHelper(input.collection);
  return {
    meta: {
      query: input.query,
      sort: input.sort
    },
    pagination: {
      page: parseInt(input.page) || 1,
      per_page: parseInt(input.per_page) || 16,
      total: data.hits.total
    },
    data: {
      items: _.map(data.hits.hits, function(doc) {
        return _.extend(
          {id: doc._id, score: doc._score},
          doc._source, doc.fields
        );
      })
    }
  }
}

var processFacet = function(input, facet) {

  var offset = input.per_page * (input.page - 1)

  facet.data = {
    buckets: _.chain(facet.buckets)
    .filter(v => {
      if (input.aggregation_query) {

        return v.key.toLowerCase().indexOf(
          input.aggregation_query.toLowerCase()
        ) === 0
      }
      return true
    })
    .value()
  }

  facet.pagination = {
    page: parseInt(input.page) || 1,
    per_page: parseInt(input.per_page) || 16,
    total: parseInt(facet.data.buckets.length)
  }

  facet.data.buckets = facet.data.buckets.slice(offset, offset + input.per_page);

  facet = _.omit(facet, [
    'doc_count',
    'size',
    'title',
    'name',
    'type',
    'buckets',
    'position'
  ])
  return facet
}

module.exports = {
  getAggregationsResponse: getAggregationsResponse,
  mergeInternalAggregations: mergeInternalAggregations,
  searchConverter: searchConverter,
  processFacet: processFacet,
  facetsConverter: facetsConverter,
  similarConverter: similarConverter
}

