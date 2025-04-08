import React from "react"

const ActualVoteBar = ({ voteMatrix }) => {
  const totalVotes = voteMatrix.flat().length
  const agreeVotes = voteMatrix.flat().filter((vote) => vote === 1).length
  const disagreeVotes = voteMatrix.flat().filter((vote) => vote === -1).length
  const passVotes = voteMatrix.flat().filter((vote) => vote === 0).length
  const nonVotes = voteMatrix.flat().filter((vote) => vote === null).length

  const validVotes = totalVotes - nonVotes

  const agreePercentage = validVotes > 0 ? (agreeVotes / validVotes) * 100 : 0
  const disagreePercentage =
    validVotes > 0 ? (disagreeVotes / validVotes) * 100 : 0
  const passPercentage = validVotes > 0 ? (passVotes / validVotes) * 100 : 0

  return (
    <div className="actual-vote-bar">
      <div className="vote-bar" style={{ width: "80%", margin: "0 auto" }}>
        <div className="agree-bar" style={{ width: `${agreePercentage}%` }}>
          {agreePercentage.toFixed(1)}% ({agreeVotes})
        </div>
        <div
          className="disagree-bar"
          style={{ width: `${disagreePercentage}%` }}
        >
          {disagreePercentage.toFixed(1)}% ({disagreeVotes})
        </div>
        <div className="pass-bar" style={{ width: `${passPercentage}%` }}>
          {passPercentage.toFixed(1)}% ({passVotes})
        </div>
      </div>
    </div>
  )
}

export default ActualVoteBar
