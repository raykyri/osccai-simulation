/**
   * Principal Component Analysis implementation in TypeScript
   * Based on the Polis PCA implementation
   */

  // Type definitions
  type Vector = number[];
  type Matrix = number[][];
  type PCAResult = {
    center: Vector;
    comps: Matrix;
    commentProjection?: Matrix;
    commentExtremity?: Vector;
  };

  /**
   * Create a vector of length n filled with value x
   */
  function repeatv(n: number, x: number): Vector {
    return Array(n).fill(x);
  }

  /**
   * Compute the dot product of two vectors
   */
  function dot(a: Vector, b: Vector): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  /**
   * Compute the length (L2 norm) of a vector
   */
  function length(v: Vector): number {
    return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  }

  /**
   * Normalize a vector to unit length
   */
  function normalize(v: Vector): Vector {
    const len = length(v);
    if (len === 0) return v;
    return v.map(x => x / len);
  }

  /**
   * Add two vectors
   */
  function addVectors(a: Vector, b: Vector): Vector {
    return a.map((val, i) => val + b[i]);
  }

  /**
   * Subtract vector b from vector a
   */
  function subtractVectors(a: Vector, b: Vector): Vector {
    return a.map((val, i) => val - b[i]);
  }

  /**
   * Multiply a vector by a scalar
   */
  function multiplyVector(v: Vector, scalar: number): Vector {
    return v.map(x => x * scalar);
  }

  /**
   * Transpose a matrix
   */
  function transpose(m: Matrix): Matrix {
    if (m.length === 0) return [];
    return m[0].map((_, i) => m.map(row => row[i]));
  }

  /**
   * Matrix multiplication: A * B
   */
  function matrixMultiply(a: Matrix, b: Matrix): Matrix {
    const bTransposed = transpose(b);
    return a.map(row =>
      bTransposed.map(col =>
        row.reduce((sum, val, i) => sum + val * col[i], 0)
      )
    );
  }

  /**
   * Calculates the mean of each column in a matrix
   */
  function meanRows(data: Matrix): Vector {
    const n = data.length;
    if (n === 0) return [];

    const m = data[0].length;
    const sums = Array(m).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        sums[j] += data[i][j];
      }
    }

    return sums.map(sum => sum / n);
  }

  /**
   * Center the data by subtracting the mean from each column
   */
  function centerData(data: Matrix): Matrix {
    const center = meanRows(data);
    return data.map(row => subtractVectors(row, center));
  }

  /**
   * Internal function for power iteration.
   * Computes an inner step of the power-iteration process
   */
  function xtxr(data: Matrix, startVec: Vector): Vector {
    const nCols = data[0].length;
    let currVec = repeatv(nCols, 0);

    for (const row of data) {
      const innerProduct = dot(startVec, row);
      const scaledRow = multiplyVector(row, innerProduct);
      currVec = addVectors(currVec, scaledRow);
    }

    return currVec;
  }

  /**
   * Power iteration method to find the dominant eigenvector
   */
  function powerIteration(data: Matrix, iters: number = 100, startVector?: Vector): Vector {
    const nCols = data[0].length;
    let vector = startVector || repeatv(nCols, 1);

    // Ensure startVector has the right size
    if (vector.length < nCols) {
      const extension = repeatv(nCols - vector.length, 1);
      vector = [...vector, ...extension];
    }

    let lastEigval = 0;

    for (let i = 0; i < iters; i++) {
      const productVector = xtxr(data, vector);
      const eigval = length(productVector);
      const normed = normalize(productVector);

      if (i === iters - 1 || Math.abs(eigval - lastEigval) < 1e-10) {
        return normed;
      }

      vector = normed;
      lastEigval = eigval;
    }

    return vector;
  }

  /**
   * Project vector ys onto vector xs
   */
  function projVec(xs: Vector, ys: Vector): Vector {
    const dotProduct = dot(xs, ys);
    const dotSelf = dot(xs, xs);

    if (dotSelf < 1e-10) return repeatv(xs.length, 0);
    
    const coeff = dotProduct / dotSelf;
    return multiplyVector(xs, coeff);
  }

  /**
   * Factor out the component from the data matrix
   * This is like the Gram-Schmidt process - we remove the variance in the direction of xs
   */
  function factorMatrix(data: Matrix, xs: Vector): Matrix {
    if (dot(xs, xs) === 0) return data;

    return data.map(row =>
      subtractVectors(row, projVec(xs, row))
    );
  }

  /**
   * Generate a random starting vector
   */
  function randStartingVec(data: Matrix): Vector {
    const nCols = data[0].length;
    const vec = Array(nCols).fill(0).map(() => /*Math.random() - */0.5);
    return normalize(vec);
  }

  /**
   * Main PCA function using power iteration
   */
  function poweritPca(
    data: Matrix,
    nComps: number = 2,
    options: {
      iters?: number;
      startVectors?: Vector[]
    } = {}
  ): PCAResult {
    const { iters = 100, startVectors = [] } = options;
    const center = meanRows(data);
    const centeredData = data.map(row => subtractVectors(row, center));

    const dataDim = Math.min(centeredData.length, centeredData[0].length);
    let remainingComps = Math.min(nComps, dataDim);
    let currentData = centeredData;
    let pcs: Vector[] = [];
    let currentVectors = [...startVectors];

    while (remainingComps > 0) {
      const startVector = currentVectors.shift() || randStartingVec(currentData);
      const pc = powerIteration(currentData, iters, startVector);
      pcs.push(pc);

      if (remainingComps === 1) {
        break;
      }

      currentData = factorMatrix(currentData, pc);
      remainingComps--;
    }

    return { center, comps: pcs };
  }

  /**
   * Wrapper for PCA that handles edge cases
   */
  function wrappedPca(
    data: Matrix,
    nComps: number = 2,
    options: {
      iters?: number;
      startVectors?: Vector[]
    } = {}
  ): PCAResult {
    const nRows = data.length;
    const nCols = nRows > 0 ? data[0].length : 0;

    // Handle edge case: single row
    if (nRows === 1) {
      return {
        center: repeatv(nComps, 0),
        comps: [
          normalize(data[0]),
          ...Array(nComps - 1).fill(repeatv(nCols, 0))
        ]
      };
    }

    // Handle edge case: single column
    if (nCols === 1) {
      return {
        center: [0],
        comps: [[1]]
      };
    }

    // Filter out all-zero start vectors
    const filteredStartVectors = options.startVectors?.map(
      vec => vec.every(v => v === 0) ? null : vec
    ).filter(Boolean) as Vector[] | undefined;

    return poweritPca(data, nComps, {
      ...options,
      startVectors: filteredStartVectors
    });
  }

  /**
   * Project data onto principal components
   */
  function pcaProject(data: Matrix, pcaResult: PCAResult): Matrix {
    const { comps, center } = pcaResult;
    const centeredData = data.map(row => subtractVectors(row, center));
    return matrixMultiply(centeredData, transpose(comps));
  }

  /**
   * Project a single participant with sparse data
   */
  function sparsityAwareProjectPtpt(votes: (number | null)[], pcaResult: PCAResult): Vector {
    const { comps, center } = pcaResult;
    const nCmnts = votes.length;
    const [pc1, pc2] = comps;

    let nVotes = 0;
    let p1 = 0;
    let p2 = 0;

    // Zip the arrays together and process
    for (let i = 0; i < votes.length; i++) {
      const xN = votes[i];
      if (xN !== null) {
        const xNPrime = xN - center[i];
        nVotes++;
        p1 += xNPrime * pc1[i];
        p2 += xNPrime * pc2[i];
      }
    }

    // Scale the projection based on participation
    const scaleFactor = Math.sqrt(nCmnts / Math.max(nVotes, 1));
    return [p1 * scaleFactor, p2 * scaleFactor];
  }

  /**
   * Project multiple participants with sparse data
   */
  function sparsityAwareProjectPtpts(data: (number | null)[][], pcaResult: PCAResult): Vector[] {
    return data.map(row => sparsityAwareProjectPtpt(row, pcaResult));
  }

  /**
   * Project comments onto the principal component space
   */
  function pcaProjectCmnts(pcaResult: PCAResult): Matrix {
    const { comps, center } = pcaResult;
    const nCols = comps[0].length;

    // Create a data structure where each comment is represented as a vector with a -1 at its position
    const commentVectors: (number | null)[][] = [];

    for (let i = 0; i < nCols; i++) {
      const vector = Array(nCols).fill(null);
      vector[i] = -1;
      commentVectors.push(vector);
    }

    return sparsityAwareProjectPtpts(commentVectors, pcaResult);
  }

  /**
   * Compute projection and extremity and merge into PCA results
   */
  function withProjAndExtremity(pcaResult: PCAResult): PCAResult {
    const cmntProj = pcaProjectCmnts(pcaResult);
    const cmntExtremity = cmntProj.map(row => length(row));

    return {
      ...pcaResult,
      commentProjection: transpose(cmntProj),
      commentExtremity: cmntExtremity
    };
  }

  /**
   * Top-level PCA function for Polis-like analysis
   */
  function runPCA(data: Matrix, options: {
    nComps?: number;
    iters?: number;
    startVectors?: Vector[];
  } = {}): PCAResult {
    const { nComps = 2, iters = 100, startVectors } = options;

    const pca = wrappedPca(data, nComps, { iters, startVectors });
    return withProjAndExtremity(pca);
  }

  export {
    runPCA,
    pcaProject,
    sparsityAwareProjectPtpts,
    pcaProjectCmnts,
    centerData,
    type PCAResult,
    type Matrix,
    type Vector
  };
