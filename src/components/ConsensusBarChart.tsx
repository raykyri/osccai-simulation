export const ConsensusBarChart = ({ groups, comments, commentTexts, voteMatrix, sortByZScore = false }) => {
    if (!comments || comments.length === 0) {
      return <div>No comments with sufficient consensus</div>;
    }
  
    // Total number of participants who could have voted
    const totalParticipants = voteMatrix ? voteMatrix.length : 0;
  
    // Sort comments based on the requested sort method
    const sortedComments = [...comments].sort((a, b) => {
      if (sortByZScore) {
        // Get maximum absolute z-score for each comment
        const aMaxZScore = Math.max(
          a.agreementZScore || 0,
          a.disagreementZScore || 0,
          0
        );
        const bMaxZScore = Math.max(
          b.agreementZScore || 0,
          b.disagreementZScore || 0,
          0
        );
  
        // Sort by maximum absolute z-score (higher values first)
        return bMaxZScore - aMaxZScore;
      } else {
        // Default sort by participation count
        return (b.numSeen || b.totalVotes || 0) - (a.numSeen || a.totalVotes || 0);
      }
    });
  
    return (
      <table className="consensus-table">
        <thead>
          <tr>
            <th className="comment-header">Comment</th>
            <th className="stats-header">Overall</th>
            {groups && groups.length > 0 && groups.map((group, groupIndex) => (
              <th key={groupIndex} className="stats-header">
                Group {groupIndex + 1} ({group.points.length})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedComments.map((comment) => {
            // Use the values directly from the comment object
            const agrees = comment.numAgrees || comment.agrees || 0;
            const disagrees = comment.numDisagrees || comment.disagrees || 0;
            const totalSeen = comment.numSeen || comment.totalVotes || 0;
  
            // Use the passes value if provided, otherwise calculate it
            let passes = comment.numPasses || 0;
            let noVotes = 0;
  
            // Only calculate passes and noVotes if they're not provided
            if (voteMatrix && voteMatrix.length > 0 && !comment.numPasses) {
              voteMatrix.forEach(participantVotes => {
                const vote = participantVotes[comment.commentId || comment.commentIndex];
                if (vote === 0) passes++;
                if (vote === null) noVotes++;
              });
            }
  
            // Calculate percentages based on TOTAL participants
            const agreePercent = (agrees / totalParticipants) * 100;
            const disagreePercent = (disagrees / totalParticipants) * 100;
            const passPercent = (passes / totalParticipants) * 100;
            const noVotePercent = (noVotes / totalParticipants) * 100;
  
            // Get comment index from either format
            const commentIndex = comment.commentId !== undefined ? comment.commentId : comment.commentIndex;
  
            // Calculate vote percentages for the text label (out of those who voted)
            const totalVotes = agrees + disagrees + passes;
            const agreeVotePercent = totalVotes > 0 ? (agrees / totalVotes) * 100 : 0;
            const disagreeVotePercent = totalVotes > 0 ? (disagrees / totalVotes) * 100 : 0;
            const passVotePercent = totalVotes > 0 ? (passes / totalVotes) * 100 : 0;
  
            return (
              <tr key={commentIndex}>
                <td className="comment-cell">
                  <div className="comment-text-preview">
                    <span className="comment-id-text">
                      {commentTexts?.[commentIndex]?.id || `Comment ${commentIndex + 1}`}:
                    </span>
                    {comment.text || comment.commentText}
                  </div>
                </td>
                <td className="consensus-cell">
                  <div className="consensus-bar-wrapper">
                    <div className="consensus-bar-multi">
                      <div
                        className="agree-bar"
                        style={{
                          width: `${agreePercent}%`,
                        }}
                        title={`${Math.round(agreePercent)}% of all participants agree (${agrees} votes)`}
                      />
                      <div
                        className="disagree-bar"
                        style={{
                          width: `${disagreePercent}%`,
                        }}
                        title={`${Math.round(disagreePercent)}% of all participants disagree (${disagrees} votes)`}
                      />
                      <div
                        className="pass-bar"
                        style={{
                          width: `${passPercent}%`,
                        }}
                        title={`${Math.round(passPercent)}% of all participants pass (${passes} votes)`}
                      />
                      <div
                        className="no-vote-bar"
                        style={{
                          width: `${noVotePercent}%`,
                        }}
                        title={`${Math.round(noVotePercent)}% of all participants didn't vote (${noVotes} participants)`}
                      />
                    </div>
                  </div>
                  <div className="consensus-stats">
                    <div className="vote-breakdown">
                      <span className="agree-count">{agrees} agree ({Math.round(agreeVotePercent)}%)</span>
                      <span className="disagree-count">{disagrees} disagree ({Math.round(disagreeVotePercent)}%)</span>
                      <span className="pass-count">{passes} pass ({Math.round(passVotePercent)}%)</span>
                    </div>
                  </div>
                </td>
                
                {groups && groups.length > 0 && groups.map((group, groupIndex) => {
                  // Calculate stats for just this group
                  let groupAgrees = 0;
                  let groupDisagrees = 0;
                  let groupPasses = 0;
                  let groupNoVotes = 0;
                  
                  if (voteMatrix) {
                    group.points.forEach(participantIndex => {
                      const vote = voteMatrix[participantIndex][commentIndex];
                      if (vote === 1) groupAgrees++;
                      else if (vote === -1) groupDisagrees++;
                      else if (vote === 0) groupPasses++;
                      else groupNoVotes++;
                    });
                  }
                  
                  const groupTotal = group.points.length;
                  const groupTotalVotes = groupAgrees + groupDisagrees + groupPasses;
                  
                  // Calculate percentages for this group
                  const groupAgreePercent = (groupAgrees / groupTotal) * 100;
                  const groupDisagreePercent = (groupDisagrees / groupTotal) * 100;
                  const groupPassPercent = (groupPasses / groupTotal) * 100;
                  const groupNoVotePercent = (groupNoVotes / groupTotal) * 100;
                  
                  // Calculate vote percentages out of those who voted in this group
                  const groupAgreeVotePercent = groupTotalVotes > 0 ? (groupAgrees / groupTotalVotes) * 100 : 0;
                  const groupDisagreeVotePercent = groupTotalVotes > 0 ? (groupDisagrees / groupTotalVotes) * 100 : 0;
                  const groupPassVotePercent = groupTotalVotes > 0 ? (groupPasses / groupTotalVotes) * 100 : 0;
  
                  return (
                    <td key={groupIndex} className="consensus-cell">
                      <div className="consensus-bar-wrapper">
                        <div className="consensus-bar-multi">
                          <div
                            className="agree-bar"
                            style={{
                              width: `${groupAgreePercent}%`,
                            }}
                            title={`${Math.round(groupAgreePercent)}% of Group ${groupIndex + 1} agree (${groupAgrees} votes)`}
                          />
                          <div
                            className="disagree-bar"
                            style={{
                              width: `${groupDisagreePercent}%`,
                            }}
                            title={`${Math.round(groupDisagreePercent)}% of Group ${groupIndex + 1} disagree (${groupDisagrees} votes)`}
                          />
                          <div
                            className="pass-bar"
                            style={{
                              width: `${groupPassPercent}%`,
                            }}
                            title={`${Math.round(groupPassPercent)}% of Group ${groupIndex + 1} pass (${groupPasses} votes)`}
                          />
                          <div
                            className="no-vote-bar"
                            style={{
                              width: `${groupNoVotePercent}%`,
                            }}
                            title={`${Math.round(groupNoVotePercent)}% of Group ${groupIndex + 1} didn't vote (${groupNoVotes} participants)`}
                          />
                        </div>
                      </div>
                      <div className="consensus-stats">
                        <div className="vote-breakdown">
                          <span className="agree-count">{groupAgrees} ({Math.round(groupAgreeVotePercent)}%)</span>
                          <span className="disagree-count">{groupDisagrees} ({Math.round(groupDisagreeVotePercent)}%)</span>
                          <span className="pass-count">{groupPasses} ({Math.round(groupPassVotePercent)}%)</span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };