import React, { useMemo, useState, useCallback } from 'react';
import ActualVoteBar from './ActualVoteBar';
import { debug } from '../utils/debug';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css'; // Import the default styling

const VoteMatrix = ({ voteMatrix, handleVoteChange, selectedGroup, groups, highlightedComment, commentTexts }) => {
    const [copyButtonText, setCopyButtonText] = useState('Copy Vote Matrix Data');

    const copyVoteMatrixData = useCallback(() => {
        if (!voteMatrix || voteMatrix.length === 0) {
            return;
        }

        const formattedData = JSON.stringify(voteMatrix)
            .replace(/\],\[/g, '],\n  [')
            .replace('[[', '[\n  [')
            .replace(']]', ']\n]');

        const copyText = `voteMatrix = ${formattedData}`;

        navigator.clipboard.writeText(copyText).then(() => {
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy Vote Matrix Data'), 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }, [voteMatrix]);

    debug("VoteMatrix props:", { voteMatrix, selectedGroup, groups, highlightedComment, commentTexts });
    const renderVoteMatrix = useMemo(() => {
      if (!voteMatrix || voteMatrix.length === 0 || !voteMatrix[0]) {
        debug("No vote matrix data available");
        return <div>No vote matrix data available</div>;
      }
  
      const handleScroll = (e) => {
        const labels = document.querySelector('.column-labels');
        const container = e.target;
        if (labels) {
          labels.style.transform = `translateX(-${container.scrollLeft}px)`;
        }
      };
  
      return (
        <div className="vote-matrix-outer-container">
          <h2>Vote Matrix</h2>
          <div className="axis-label participants-label">Participants</div>
          <div className="axis-label comments-label">Comments</div>
          <div className="vote-matrix-container" onScroll={handleScroll}>
            <div className="vote-matrix">
              <div className="column-labels-container">
                <div className="column-labels">
                  {voteMatrix[0].map((_, j) => (
                      <div
                        className={`column-label ${highlightedComment === j ? 'highlighted' : ''}`}
                      >
                        <Tippy 
                          key={j}
                          content={commentTexts?.[j] ? commentTexts[j].text : `Comment ${j + 1}`}
                          placement="top"
                          arrow={true}
                          animation="fade"
                          duration={100}
                          delay={[0, 0]}
                          zIndex={99999}
                        ><div>{j + 1}</div></Tippy>
                      </div>
                  ))}
                </div>
              </div>
              <div className="matrix-scroll-container">
                <div className="matrix-content">
                  {voteMatrix.map((row, i) => (
                    <div key={i} className={`matrix-row ${selectedGroup !== null && groups[selectedGroup]?.points.includes(i) ? 'highlighted' : ''}`}>
                      <div className="row-label">{i + 1}</div>
                      {row.map((vote, j) => (
                        <div
                          key={j}
                          className={`matrix-cell ${vote === 1 ? 'agree' : vote === -1 ? 'disagree' : 'pass'} ${highlightedComment === j ? 'highlighted' : ''}`}
                          onClick={() => handleVoteChange(i, j)} // Handle cell click
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <h3>Actual Vote Breakdown</h3>
          <ActualVoteBar voteMatrix={voteMatrix} />
        </div>
      );
    }, [voteMatrix, handleVoteChange, selectedGroup, groups, highlightedComment, commentTexts]);
  
    return (
      <div>
        {renderVoteMatrix}
        <button onClick={copyVoteMatrixData} style={{ marginTop: '10px' }}>
          {copyButtonText}
        </button>
      </div>
    );
  };

export default VoteMatrix;