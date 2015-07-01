/*
 * Copyright 2015 Paradone
 *
 * This file is part of Paradone <https://paradone.github.io>
 *
 * Paradone is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Paradone is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Paradone.  If not, see <http://www.gnu.org/licenses/>.
 */

import MediaPeer from './mediaPeer.js'
import Gossip from './gossip.js'

var modules = {
  gossip: Gossip,
  media: MediaPeer
}

/**
 * Use mixins to give more functionalities to a Peer object
 * @module extensions
 */

/**
 * Extends the peer instance with a module
 *
 * @function module:extensions~apply
 * @param {Peer} peer - Peer instance to be extended
 * @param {Array.<Extension>} extensions - List of mixins used to extend the
 *        initial Peer object
 */
export function apply(peer, extensions) {
  extensions.forEach(ext => modules[ext.name].call(peer, ext))
}

/**
 * @typedef Extension
 * @type {Object}
 * @property {string} name - Name of the extension. Will be used as parameters
 *           in Peer's constructor options
 */
