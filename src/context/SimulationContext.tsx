import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from "react"
import { debug } from "../utils/debug.ts"
import {
  findOptimalClusters,
  getBestK,
} from "../utils/silhouetteCoefficient.ts"

const DEFAULT_PARTICIPANTS = 50
const DEFAULT_COMMENTS = 50
const DEFAULT_AGREE_PERCENTAGE = 33
const DEFAULT_DISAGREE_PERCENTAGE = 33
const DEFAULT_CONSENSUS_GROUPS = 3
const DEFAULT_GROUPING_THRESHOLD = 2.0
const DEFAULT_GROUP_SIMILARITY = 50
const DEFAULT_KMEANS_K = 3

const SimulationContext = createContext(undefined)

export const SimulationProvider = ({ children }) => {
  const [participants, setParticipants] = useState(DEFAULT_PARTICIPANTS)
  const [comments, setComments] = useState(DEFAULT_COMMENTS)
  const [groupSimilarity, setGroupSimilarity] = useState(
    DEFAULT_GROUP_SIMILARITY,
  )
  const [consensusGroups, setConsensusGroups] = useState(
    DEFAULT_CONSENSUS_GROUPS,
  )
  const [groupSizes, setGroupSizes] = useState(() => {
    const sizes = Array(DEFAULT_CONSENSUS_GROUPS - 1).fill(
      100 / DEFAULT_CONSENSUS_GROUPS,
    )
    return sizes.map((size, index) => size * (index + 1))
  })
  const [groupingThreshold, setGroupingThreshold] = useState(
    DEFAULT_GROUPING_THRESHOLD,
  )
  const [agreePercentage, setAgreePercentage] = useState(
    DEFAULT_AGREE_PERCENTAGE,
  )
  const [disagreePercentage, setDisagreePercentage] = useState(
    DEFAULT_DISAGREE_PERCENTAGE,
  )
  const [voteMatrix, setVoteMatrix] = useState([])
  const [pcaProjection, setPcaProjection] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [consensusScores, setConsensusScores] = useState([])
  const [consensusThreshold, setConsensusThreshold] = useState(0.5)
  const [rangeValues, setRangeValues] = useState(() => {
    return [
      DEFAULT_AGREE_PERCENTAGE,
      DEFAULT_AGREE_PERCENTAGE + DEFAULT_DISAGREE_PERCENTAGE,
    ]
  })
  const [highlightedComment, setHighlightedComment] = useState(null)
  const [kMeansK, setKMeansK] = useState(DEFAULT_KMEANS_K)
  const [silhouetteCoefficients, setSilhouetteCoefficients] = useState([])
  const [bestK, setBestK] = useState(DEFAULT_KMEANS_K)

  const [tempParticipants, setTempParticipants] = useState(participants)
  const [tempComments, setTempComments] = useState(comments)
  const [tempGroupSimilarity, setTempGroupSimilarity] =
    useState(groupSimilarity)
  const [tempGroupSizes, setTempGroupSizes] = useState(groupSizes)

  const highlightComment = (commentIndex) => {
    setHighlightedComment(commentIndex)
  }

  const handleParticipantsChange = (value) => {
    setParticipants(value)
    setTempParticipants(value)
  }

  const handleCommentsChange = (value) => {
    setComments(value)
    setTempComments(value)
  }

  const handleRangeChange = (values) => {
    setRangeValues(values)
    setAgreePercentage(values[0])
    setDisagreePercentage(values[1] - values[0])
  }

  const handleConsensusGroupsChange = (value) => {
    debug("handleConsensusGroupsChange", value)
    setConsensusGroups(value)
    const newSizes = Array(value - 1).fill(100 / value)
    const newGroupSizes = newSizes.map((size, index) => size * (index + 1))
    setGroupSizes(newGroupSizes)
    setTempGroupSizes(newGroupSizes)
  }

  const handleGroupSimilarityChange = (value) => {
    setGroupSimilarity(value)
    setTempGroupSimilarity(value)
  }

  const handleGroupSizesChange = (newValues) => {
    const adjustedValues = newValues.map((value, index) => {
      if (index === 0) return value
      return Math.max(value, newValues[index - 1] + 1)
    })
    setGroupSizes(adjustedValues)
    setTempGroupSizes(adjustedValues)
  }

  const resetState = () => {
    setParticipants(DEFAULT_PARTICIPANTS)
    setComments(DEFAULT_COMMENTS)
    setAgreePercentage(DEFAULT_AGREE_PERCENTAGE)
    setDisagreePercentage(DEFAULT_DISAGREE_PERCENTAGE)
    setRangeValues([
      DEFAULT_AGREE_PERCENTAGE,
      DEFAULT_AGREE_PERCENTAGE + DEFAULT_DISAGREE_PERCENTAGE,
    ])
    setConsensusGroups(DEFAULT_CONSENSUS_GROUPS)
    setGroupSizes(
      Array(DEFAULT_CONSENSUS_GROUPS - 1)
        .fill(100 / DEFAULT_CONSENSUS_GROUPS)
        .map((size, index) => size * (index + 1)),
    )
    setGroupSimilarity(DEFAULT_GROUP_SIMILARITY)
    setVoteMatrix([])
    setPcaProjection([])
    setGroups([])
    setSelectedGroup(null)
    setConsensusThreshold(0.5) // Reset consensus threshold
    setTempParticipants(DEFAULT_PARTICIPANTS)
    setTempComments(DEFAULT_COMMENTS)
    setTempGroupSimilarity(DEFAULT_GROUP_SIMILARITY)
    setTempGroupSizes(
      Array(DEFAULT_CONSENSUS_GROUPS - 1)
        .fill(100 / DEFAULT_CONSENSUS_GROUPS)
        .map((size, index) => size * (index + 1)),
    )
    localStorage.removeItem("osccaiSimulationState")
  }

  // Add a new function to update kMeansK without recalculating
  const updateKMeansK = useCallback((newK) => {
    setKMeansK(newK)
  }, [])

  return (
    <SimulationContext.Provider
      value={{
        participants,
        setParticipants,
        comments,
        setComments,
        groupSimilarity,
        setGroupSimilarity,
        consensusGroups,
        setConsensusGroups,
        groupSizes,
        setGroupSizes,
        groupingThreshold,
        setGroupingThreshold,
        agreePercentage,
        setAgreePercentage,
        disagreePercentage,
        setDisagreePercentage,
        voteMatrix,
        setVoteMatrix,
        pcaProjection,
        setPcaProjection,
        groups,
        setGroups,
        selectedGroup,
        setSelectedGroup,
        consensusScores,
        setConsensusScores,
        consensusThreshold,
        setConsensusThreshold,
        rangeValues,
        setRangeValues,
        tempParticipants,
        setTempParticipants,
        tempComments,
        setTempComments,
        tempGroupSimilarity,
        setTempGroupSimilarity,
        tempGroupSizes,
        setTempGroupSizes,
        handleParticipantsChange,
        handleCommentsChange,
        handleRangeChange,
        handleConsensusGroupsChange,
        handleGroupSimilarityChange,
        handleGroupSizesChange,
        highlightComment,
        highlightedComment,
        setHighlightedComment,
        resetState,
        kMeansK,
        updateKMeansK,
        silhouetteCoefficients,
        bestK,
        findOptimalClusters,
        setSilhouetteCoefficients,
        setBestK,
      }}
    >
      {children}
    </SimulationContext.Provider>
  )
}

export const useSimulation = () => useContext(SimulationContext)
