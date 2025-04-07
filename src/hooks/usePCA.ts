import { useCallback } from 'react';
import { pca as legacyPCA } from '../utils/pca.ts';
import { runPCA, sparsityAwareProjectPtpts, type Matrix } from '../pca.ts';
import { debug } from '../utils/debug.ts';

const usePCA = (voteMatrix) => {
  const performPCA = useCallback((alternativeMatrix = null) => {
    // Use the provided alternative matrix if available, otherwise use the default voteMatrix
    const matrixToUse = alternativeMatrix || voteMatrix;
    
    if (!matrixToUse || matrixToUse.length === 0) {
      debug('Empty vote matrix in usePCA');
      return [];
    }
    
    debug('Vote matrix in usePCA:', matrixToUse);
    
    try {
      const projection = sparsityAwareProjectPtpts(matrixToUse, runPCA(matrixToUse as Matrix));
      // const projection = legacyPCA(matrixToUse);
      
      // Format the result as before
      const result = projection.map((coords, i) => {
        if (isNaN(coords[0]) || isNaN(coords[1])) {
          debug(`NaN values in PCA projection at index ${i}:`, coords);
          return { x: 0, y: 0, id: i };
        }
        return { x: coords[0], y: coords[1], id: i };
      });
      
      console.log('Processed PCA result:', result);
      return result;
    } catch (error) {
      console.log('Error in PCA calculation:', error);
      return [];
    }
  }, [voteMatrix]);

  return performPCA;
};

export default usePCA;