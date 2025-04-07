import { useCallback } from "react"
import { pca as simplePCA } from "../utils/pca.ts"
import {
  runPCA,
  sparsityAwareProjectPtpts,
  type Matrix,
} from "../utils/sparsePCA.ts"
import { debug } from "../utils/debug.ts"

const usePCA = (voteMatrix) => {
  const performPCA = useCallback(
    (alternativeMatrix = null) => {
      // Use the provided alternative matrix if available, otherwise use the default voteMatrix
      const matrixToUse = alternativeMatrix || voteMatrix

      if (!matrixToUse || matrixToUse.length === 0) {
        debug("Empty vote matrix in usePCA")
        return []
      }

      debug("Vote matrix in usePCA:", matrixToUse)

      try {
        console.log(
          `Running PCA on ${matrixToUse.length} participants, ${matrixToUse[0].length} comments`,
        )
        // const projection = sparsityAwareProjectPtpts(
        //   matrixToUse,
        //   runPCA(matrixToUse as Matrix),
        // )
        const projection = simplePCA(matrixToUse)

        // Format the result as before
        const result = projection.map((coords, i) => {
          if (isNaN(coords[0]) || isNaN(coords[1])) {
            debug(`NaN values in PCA projection at index ${i}:`, coords)
            return { x: 0, y: 0, id: i }
          }
          return { x: coords[0], y: coords[1], id: i }
        })
        return result
      } catch (error) {
        console.log("Error in PCA calculation:", error)
        return []
      }
    },
    [voteMatrix],
  )

  return performPCA
}

export default usePCA
