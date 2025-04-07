import { bytesToHex } from "@noble/hashes/utils"
import { sha256 } from "@noble/hashes/sha256"
import * as cbor from "@ipld/dag-cbor"

import { kmeans } from 'ml-kmeans';
import { debug } from './debug.js';

function kMeansClustering(data, k) {
  debug("Entering kMeansClustering", { data, k });
  if (!data || data.length === 0 || !Array.isArray(data[0]) || data[0].length !== 2) {
    debug("Invalid input data for kMeansClustering", data);
    throw new Error("Invalid input data for kMeansClustering");
  }
  debug("Valid input data for kMeansClustering", data);

  const result = kmeans(data, k, { seed: 0 });

  // Create an array to store the points for each cluster
  const clusters = Array(k).fill().map(() => []);

  // Assign each point to its cluster
  result.clusters.forEach((clusterIndex, pointIndex) => {
    clusters[clusterIndex].push(pointIndex);
  });

  return clusters.map((points, index) => ({
    centroid: result.centroids[index],
    points: points
  }));
}

export { kMeansClustering };