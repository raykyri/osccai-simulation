import React, { useEffect, useCallback, useState } from 'react';
import { SimulationProvider, useSimulation } from './context/SimulationContext.jsx';
import VoteMatrix from './components/VoteMatrix.jsx';
import PCAProjection from './components/PCAProjection.jsx';
import GroupAnalysis from './components/GroupAnalysis.jsx';
import SimulationControls from './components/SimulationControls.jsx';
import useVoteMatrix from './hooks/useVoteMatrix.js';
import usePCA from './hooks/usePCA.js';
import useGroupIdentification from './hooks/useGroupIdentification.js';
import { debug } from './utils/debug.js';
import './App.css';
import Papa from 'papaparse';

const parseCSV = (csvString) => {
  // Split the CSV into rows and skip the empty ones
  const rows = csvString.split('\n').filter(row => row.trim() !== '');
  
  // The first row contains headers
  const headers = rows[0].split(',').map(header => header.trim());
  
  // Initialize return objects
  const metadata = [];
  const data = [];
  
  // Process each row except the header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].split(',').map(cell => cell.trim());
    
    // Extract metadata (first 6 columns)
    const participantMetadata = {
      'participant': row[0],
      'group-id': row[1],
      'n-comments': parseInt(row[2]) || 0,
      'n-votes': parseInt(row[3]) || 0,
      'n-agree': parseInt(row[4]) || 0,
      'n-disagree': parseInt(row[5]) || 0
    };
    metadata.push(participantMetadata);
    
    // Extract vote data (remaining columns)
    const voteData = row.slice(6).map(vote => {
      // Convert to appropriate type: 1 for agree, -1 for disagree, 0 for pass/skip
      if (vote === '1') return 1;
      if (vote === '-1') return -1;
      return 0;
    });
    
    data.push(voteData);
  }
  
  return { metadata, data };
};

const SimulationContent = () => {
  const {
    participants,
    comments,
    agreePercentage,
    disagreePercentage,
    consensusGroups,
    groupSizes,
    groupSimilarity,
    voteMatrix,
    setVoteMatrix,
    pcaProjection,
    setPcaProjection,
    groups,
    setGroups,
    selectedGroup,
    setSelectedGroup,
    consensusScores,
    consensusThreshold,
    setConsensusThreshold,
    highlightComment,
    highlightedComment,
    resetState,
    kMeansK,
    updateKMeansK,
    silhouetteCoefficients,
    bestK,
    calculateSilhouetteCoefficients
  } = useSimulation();

  const [dataUrl, setDataUrl] = useState('https://pol.is/api/v3/reportExport/r3nhe9auvzhr36dwaytsk/participant-votes.csv');
  const [urlError, setUrlError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateAndFetchData = useCallback(() => {
    setUrlError('');

    if (!dataUrl) {
      setUrlError('Please enter a URL');
      return;
    }

    if (!dataUrl.endsWith('.csv')) {
      setUrlError('URL must point to a CSV file');
      return;
    }

    try {
      new URL(dataUrl);
    } catch (e) {
      setUrlError('Invalid URL format');
      return;
    }

    setIsLoading(true);

    fetch(dataUrl.startsWith("https://pol.is/") ? dataUrl.replace("https://pol.is/", "http://localhost:3001/proxy/") : dataUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then(data => {
        console.log('Data fetched successfully');

        // Parse CSV to JSON with our custom parser
        const { metadata, data: voteData } = parseCSV(data);
        console.log("Participant metadata:", metadata);
        console.log("Vote data:", voteData);

        // You might want to store this in your state or context
        // For example:
        // setParticipantMetadata(metadata);
        // setVoteData(voteData);

        setIsLoading(false);
      })
      .catch(error => {
        setUrlError(`Failed to fetch data: ${error.message}`);
        setIsLoading(false);
      });
  }, [dataUrl]);

  const { generateRandomVoteMatrix, handleVoteChange } = useVoteMatrix(
    participants,
    comments,
    agreePercentage,
    disagreePercentage,
    consensusGroups,
    groupSizes,
    groupSimilarity,
    voteMatrix,
    setVoteMatrix
  );

  const performPCA = usePCA(voteMatrix);
  const identifyGroups = useGroupIdentification(pcaProjection, kMeansK);

  const generateNewVoteMatrix = useCallback(() => {
    const newVoteMatrix = generateRandomVoteMatrix();
    setVoteMatrix(newVoteMatrix);
    debug("New vote matrix generated:", newVoteMatrix);
  }, [generateRandomVoteMatrix, setVoteMatrix]);

  useEffect(() => {
    generateNewVoteMatrix();
  }, [participants, comments, agreePercentage, disagreePercentage, consensusGroups, groupSizes, groupSimilarity, generateNewVoteMatrix]);

  useEffect(() => {
    if (voteMatrix && voteMatrix.length > 0) {
      const newPcaProjection = performPCA();
      setPcaProjection(newPcaProjection);
      calculateSilhouetteCoefficients(newPcaProjection);
    }
  }, [voteMatrix, performPCA, setPcaProjection, calculateSilhouetteCoefficients]);

  useEffect(() => {
    if (pcaProjection && pcaProjection.length > 0) {
      const newGroups = identifyGroups();
      setGroups(newGroups);
    }
  }, [pcaProjection, identifyGroups, setGroups]);

  return (
    <div className="App">
      <h1>Import Data</h1>
      <p>
        Enter the raw data export to analyze
        <div style={{ fontSize: "80%", color: "#666", marginTop: 2 }}>
          e.g. https://pol.is/api/v3/reportExport/.../participant-votes.csv
        </div>
      </p>

      <input
        style={{ width: "400px" }}
        type="text"
        placeholder="Data Export URL (participant-votes.csv)"
        onChange={(e) => setDataUrl(e.target.value)}
        value={dataUrl}
      />
      {urlError && <div className="error-message">{urlError}</div>}
      <br/>
      <button
        onClick={validateAndFetchData}
        disabled={!dataUrl}
      >
        Fetch Data
      </button>

      <h1>Vote Matrix and PCA Simulation</h1>
      <SimulationControls />
      <button onClick={resetState}>Reset</button>
      <VoteMatrix
        voteMatrix={voteMatrix}
        handleVoteChange={handleVoteChange}
        selectedGroup={selectedGroup}
        groups={groups}
        highlightedComment={highlightedComment}
      />
      <div className="side-by-side-container">
        <PCAProjection pcaProjection={pcaProjection} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />
        <GroupAnalysis
          groups={groups}
          setSelectedGroup={setSelectedGroup}
          voteMatrix={voteMatrix}
          consensusScores={consensusScores}
          consensusThreshold={consensusThreshold}
          setConsensusThreshold={setConsensusThreshold}
          highlightComment={highlightComment}
          selectedGroup={selectedGroup}
          kMeansK={kMeansK}
          updateKMeansK={updateKMeansK} // Changed from handleKMeansKChange
          silhouetteCoefficients={silhouetteCoefficients}
          bestK={bestK}
        />
      </div>
      <div className="group-aware-consensus">
        <h2>Group-Aware Consensus</h2>
        <div>
          <label>Minimum Consensus Threshold: </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={consensusThreshold}
            onChange={(e) => setConsensusThreshold(Number(e.target.value))}
          />
          <span>{consensusThreshold.toFixed(2)}</span>
        </div>
        <table className="consensus-table">
          <thead>
            <tr>
              <th>Comment</th>
              <th>Consensus Score</th>
              {groups.map((_, i) => (
                <th key={i}>Group {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consensusScores
              .filter(score => score.consensusScore >= consensusThreshold)
              .map(({ commentIndex, consensusScore }) => (
                <tr key={commentIndex}>
                  <td>
                    <button onClick={() => highlightComment(commentIndex)}>
                      Comment {commentIndex + 1}
                    </button>
                  </td>
                  <td>{consensusScore.toFixed(4)}</td>
                  {groups.map((group, i) => {
                    const groupVotes = group.points.map(index => voteMatrix[index][commentIndex]);
                    const agreePercentage = (groupVotes.filter(vote => vote === 1).length / groupVotes.length) * 100;
                    return (
                      <td key={i}>
                        <div className="vote-bar">
                          <div
                            className="agree-bar"
                            style={{ width: `${agreePercentage}%` }}
                          >
                            {agreePercentage.toFixed(1)}%
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <SimulationProvider>
      <SimulationContent />
    </SimulationProvider>
  );
};

export default App;