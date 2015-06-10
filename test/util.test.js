/*global before, describe, it*/
'use strict'

var util = require('../src/util.js')
var expect = require('chai').expect

describe('Util', function() {
  describe('shallowSort', function() {
    var sort = function(a, b) {
      return a > b
    }
    var shallowSort = util.shallowSort.bind(null, sort)

    it('should return a copy of an empty array', function() {
      var array = []
      var result = shallowSort([])
      expect(result).to.be.deep.eq(array)
      expect(result).to.be.not.eq(array)
    })

    it('should return a coppy of a sorted array', function() {
      var array = [1, 2, 3]
      var result = shallowSort(array)
      expect(result).to.be.deep.eq(array)
      expect(result).to.be.not.eq(array)
    })

    it('should sort the array', function() {
      expect(shallowSort([2, 3, 5, 1, 4])).to.be.deep.eq([1, 2, 3, 4, 5])
      expect(shallowSort(['b', 'c', 'a'])).to.be.deep.eq(['a', 'b', 'c'])
    })
  })

  describe('contains', function() {
    it('should contain one element', function() {
      expect(util.contains('a', ['a'])).to.be.eq(true)
      expect(util.contains(1, [1])).to.be.eq(true)
    })

    it('should not contain any element if array is empty', function() {
      expect(util.contains('a', [])).to.be.eq(false)
      expect(util.contains(2, [])).to.be.eq(false)
    })

    it('should find a value in an array with multiple elements', function() {
      expect(util.contains('a', ['b', 'a', 'c', 1, 2])).to.be.eq(true)
      expect(util.contains(1, [1, 3, 4, 5, 'a'])).to.be.eq(true)
    })

  })

  describe('containsMatch', function() {

    describe('empty arrays contain nothing', function() {
      it('should pass for empty array template', function() {
        expect(util.containsMatch([], [])).to.be.eq(false)
      })
      it('should pass for empty object template', function() {
        expect(util.containsMatch({}, [])).to.be.eq(false)
      })
      it('should pass for array template', function() {
        expect(util.containsMatch([1, 2], [])).to.be.eq(false)
      })
      it('should pass for empty object template', function() {
        expect(util.containsMatch({a: 1}, [])).to.be.eq(false)
      })
    })

    describe('empty templates will match anything', function() {
      it('should pass for array template and Array.<Object>', function() {
        expect(util.containsMatch([], [{a: 1}])).to.be.eq(true)
      })
      it('should pass for object template and Array.<Object>', function() {
        expect(util.containsMatch({}, [{a: 1}])).to.be.eq(true)
      })
      it('should pass for array template and Array.<array>', function() {
        expect(util.containsMatch([], [['a', 1]])).to.be.eq(true)
      })
      it('should pass for array template and Array.<array>', function() {
        expect(util.containsMatch({}, [['a', 1]])).to.be.eq(true)
      })
    })

    describe('simple object templates', function() {
      it('should find a match in single element array', function() {
        expect(util.containsMatch({a: 1}, [{a: 1}])).to.be.eq(true)
      })
      it('should find not find non present element', function() {
        expect(util.containsMatch({a: 1}, [{a: 2}, {b: 1}])).to.be.eq(false)
      })
      it('should find it in multiple elements array', function() {
        expect(
          util.containsMatch(
            {a: 1},
            [{a: 2}, {b: 1}, {a: 1}, {a: 3}, {c: 3}]))
          .to.be.eq(true)
      })
    })

    describe('simple array templates', function() {
      it('should find a match in single element array', function() {
        expect(util.containsMatch([1], [[1]])).to.be.eq(true)
      })
      it('should find not find non present element', function() {
        expect(util.containsMatch([1], [[2], {b: 1}])).to.be.eq(false)
      })
      it('should find it in multiple elements array', function() {
        expect(
          util.containsMatch(
            [1],
            [[2], {b: 1}, [1], [2, 3], {c: 3}]))
          .to.be.eq(true)
      })
    })

    describe('complex templates', function() {
      it('should find element with an array property', function() {
        var template = {a: [1, 2, 3]}
        var array = [{a: {a: 1}, b: 2},
                     {a: [1, 2, 4]},
                     {a: [1, 2, 3]}]
        expect(util.containsMatch(template, array)).to.be.eq(true)
      })

      it('should find a \"fuzzy\" match', function() {
        var template = {a: [1, 2, 3]}
        var array = [{a: {a: 1}, b: 2},
                     {a: [1, 2, 4]},
                     {a: [1, 2, 3, 4]}]
        expect(util.containsMatch(template, array)).to.be.eq(true)
      })

      it('should not match find match if a value is missing', function() {
        var template = {a: [1, 2, 3]}
        var array = [{a: {a: 1}, b: 2},
                     {a: [1, 2, 4]},
                     {a: [1, 2]}]
        expect(util.containsMatch(template, array)).to.be.eq(false)
      })

    })

  })

})
