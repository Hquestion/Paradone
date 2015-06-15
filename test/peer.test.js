/*global sinon, expect, before, describe, it*/
'use strict'

var proxyquire = require('proxyquireify')(require)
var Peer = proxyquire('../src/peer.js', {
  './signal.js': function() {
    return {
      send: function(message) {
        console.debug('Mocked signal send', message)
      }
    }
  }
})
var MessageEmitter = require('../src/messageEmitter.js')
var options = {
  signal: { url: 'ws://127.0.0.1'}
}

var newpeer = function(id) {
  var p = new Peer(options)
  p.id = id
  p.connections.delete('signal')
  return p
}

describe('Peer', function() {
  this.timeout(5000)

  /*
   * It should go like this
   * - A sends request-peer
   * - B responds with offer
   * - A responds with answer
   * - A and B receive ICE
   * - Datachannel is open => onconnected event is emitted
   * - Disconnection of a peer
   */
  describe('1-to-1 connection protocol', function(done) {
    var peers = {}
    var peerA = peers.A = newpeer('A')
    var peerB = peers.B = newpeer('B')

    var stubbedSend = function(message) {
      var to = message.to
      if(to === '-1') {
        to = message.from === peerA.id ? peerB.id : peerA.id
      }
      var peer = peers[to]
      peer.dispatchMessage(message)
    }

    sinon.stub(peerA, 'send', stubbedSend)
    sinon.stub(peerB, 'send', stubbedSend)

    peerA.on('connected', function() {
      done()
    })
  })

  describe('Mesh structure', function() {

    describe('A sends messages on the mesh', function() {

      var peers = {}

      beforeEach(function(done) {
        var peerA = peers.A = newpeer('A')
        var peerB = peers.B = newpeer('B')
        var peerC = peers.C = newpeer('C')

        var requestFromB = {
          type: 'request-peer',
          from: peerB.id,
          to: -1,
          ttl: 3,
          forwardBy: []
        }

        // Stub peers to simulate a connection
        sinon.stub(peerA, 'send', function(message) {
          peers[message.to].dispatchMessage(message)
        })
        sinon.stub(peerB, 'send', function(message) {
          peers[message.to].dispatchMessage(message)
        })
        sinon.stub(peerC, 'send', function(message) {
          peers[message.to].dispatchMessage(message)
        })

        // Send peer request from B to A and C
        peerA.dispatchMessage(requestFromB)
        peerC.dispatchMessage(requestFromB)

        // Wait for connection to be established
        peerB.on('connected', function() {
          done()
        })
      })

      it('B receive the test request (1 hop)', function(done) {
        peers.A.send.restore()
        peers.B.send.restore()
        peers.C.send.restore()

        peers.B.on('test', function() {
          done()
        })
        peers.A.send({
          type: 'test',
          from: peers.A.id,
          to: peers.B.id,
          data: 'AtoB',
          ttl: 3,
          forwardBy: []
        })
      })

      it('C receive the peer request (2 hops)', function(done) {
        peers.A.send.restore()
        peers.B.send.restore()
        peers.C.send.restore()

        // Only request-peer, icecandidate, offer and answer are forwarded
        peers.C.removeAllListeners('request-peer')
        peers.C.on('request-peer', function(message) {
          expect(message.from).to.be.equal(peers.A.id)
          expect(message.forwardBy.length).to.be.equal(1)
          expect(message.ttl).to.be.equal(2)
          done()
        })
        peers.A.send({
          type: 'request-peer',
          from: peers.A.id,
          to: peers.C.id,
          data: 'AtoC',
          ttl: 3,
          forwardBy: []
        })
      })

      it('A stores message, requests connection and transmit message', function(done) {
        peers.A.send.restore()
        peers.B.send.restore()
        peers.C.send.restore()

        peers.C.on('queuetest', function() {
          expect(peers.A.queue).to.be.empty
          done()
        })

        peers.A.send({
          type: 'queuetest',
          from: peers.A.id,
          to: peers.C.id,
          data: 'AtoC2',
          ttl: 3,
          forwardBy: []
        })
        expect(peers.A.queue).to.have.length(1)
        // expect(peers.A.queue[0].message.type).to.be.eq('queuetest')
      })

    })

    describe('One node connecting requesting multiple peers', function() {

      var peers = {}
      var peerA
      var peerB
      var peerC

      // Connect A to B and send request from C to both
      before(function(done) {
        peerA = peers.a = newpeer('a')
        peerB = peers.b = newpeer('b')
        peerC = peers.c = newpeer('c')

        var requestFromB = {
          type: 'request-peer',
          from: peerB.id,
          to: -1,
          ttl: 3,
          forwardBy: []
        }
        var requestFromC = {
          type: 'request-peer',
          from: peerC.id,
          to: -1,
          ttl: 3,
          forwardBy: []
        }

        var dispatchMessage = function(message) {
          peers[message.to].dispatchMessage(message)
        }
        sinon.stub(peerA, 'send', dispatchMessage)
        sinon.stub(peerB, 'send', dispatchMessage)
        sinon.stub(peerC, 'send', dispatchMessage)

        peerB.on('connected', function self() {
          // Wait for connection with A to be established
          peerA.dispatchMessage(requestFromC)
          peerB.dispatchMessage(requestFromC)
          peerB.removeListener('connected', self)
        })

        peerC.on('connected', function() {
          try {
            peerA.send.restore()
            peerB.send.restore()
            peerC.send.restore()
          } catch(e) {
            // DEBUG Might be wrong
            // TODO
          }
          done()
        })

        // Connect A and B
        peerA.dispatchMessage(requestFromB)
      })

      describe('C should be connected', function() {
        it('should have an open connection', function() {
          expect(peerC.connections.get(peerB.id).status).to.be.equal('open')
        })
      })
    })

  })

  describe('Timeout messages', function() {
    it('should store connection related messages', function() {
      var peer = newpeer('1')
      peer.send({
        type: 'offer',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'request-peer',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'answer',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'icecandidate',
        from: peer.id,
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      expect(peer.queue).to.have.length(4)
    })

    it('should not store connection related message that were forwarded to the peer', function() {
      var peer = newpeer('1')
      peer.send({
        type: 'offer',
        from: 'b',
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'request-peer',
        from: 'b',
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'answer',
        from: 'b',
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      peer.send({
        type: 'icecandidate',
        from: 'b',
        to: 'a',
        data: '',
        ttl: 3,
        forwardBy: []
      })
      expect(peer.queue).to.be.empty
    })

    it('should store non connection related messages', function() {
      var peer = newpeer('1')
      peer.send({
        type: 'queuetest',
        from: peer.id,
        to: 'a',
        data: ''
      })
      // Should contain the `queuetest` and `request-peer` messages
      expect(peer.queue).to.have.length(2)
      peer.send({
        type: 'queuetest2',
        from: peer.id,
        to: 'a',
        data: ''
      })
      // The `request-peer` is already present only `queuetest2` will be stored
      expect(peer.queue).to.have.length(3)
    })

    it('should drop messages after timeout and executes the callbacks', function(done) {
      var clock = sinon.useFakeTimers()
      var peer = newpeer('1')
      peer.send({
        type: 'queuetest',
        from: peer.id,
        to: 'a',
        data: ''
      }, Peer.queueTimeout * 1.5, done)

      // After sending
      expect(peer.queue).to.have.length(2)
      // Just before timeout
      clock.tick(Peer.queueTimeout - 1)
      expect(peer.queue).to.have.length(2)
      // Just after first timeout
      clock.tick(2)
      expect(peer.queue).to.have.length(2)
      // After message timeout and before second queue timeout
      clock.tick(Peer.queueTimeout / 2)
      expect(peer.queue).to.have.length(2)
      // After second queue timeout
      clock.tick(Peer.queueTimeout / 2)
      expect(peer.queue).to.have.length(1)

      clock.restore()
    })
  })

})
