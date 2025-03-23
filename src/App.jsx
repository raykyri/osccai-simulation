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
import Papa from 'papaparse';
import './App.css';

const parseCSV = (csvString) => {
  // Use Papa Parse to parse the CSV properly
  const parseResult = Papa.parse(csvString, { 
    header: true,
    skipEmptyLines: true
  });
  
  // Extract headers from the parse results
  const headers = parseResult.meta.fields;
   
  // Initialize return objects
  const metadata = [];
  const data = [];
  
  // Process each row
  parseResult.data.forEach(row => {
    // Extract metadata (first 6 columns)
    const participantMetadata = {
      'participant': row['participant'] || '',
      'group-id': row['group-id'] || '',
      'n-comments': parseInt(row['n-comments']) || 0,
      'n-votes': parseInt(row['n-votes']) || 0,
      'n-agree': parseInt(row['n-agree']) || 0,
      'n-disagree': parseInt(row['n-disagree']) || 0
    };
    metadata.push(participantMetadata);
    
    // Extract vote data (columns after the first 6)
    const voteData = headers.slice(6).map(header => {
      const vote = row[header];
      // Convert to appropriate type: 1 for agree, -1 for disagree, 0 for pass/skip
      if (vote === '1') return 1;
      if (vote === '-1') return -1;
      return 0;
    });
    
    data.push(voteData);
  });
  
  return { metadata, data };
};

const parseCommentsCSV = (csvString) => {
  // Use Papa Parse to handle CSV parsing with proper escaping
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true
  });
  
  // Map the parsed data to our comment structure
  const comments = parseResult.data.map(row => ({
    timestamp: row['timestamp'] || '',
    datetime: row['datetime'] || '',
    id: row['comment-id'] || '',
    author_id: row['author-id'] || '',
    agrees: parseInt(row['agrees']) || 0,
    disagrees: parseInt(row['disagrees']) || 0,
    moderated: row['moderated'] || '',
    text: row['comment-body'] || ''
  }));
  
  // Sort comments by ID 
  comments.sort((a, b) => {
    // If IDs are numeric, convert to numbers for comparison
    const idA = isNaN(Number(a.id)) ? a.id : Number(a.id);
    const idB = isNaN(Number(b.id)) ? b.id : Number(b.id);
    
    // Sort in ascending order
    return idA > idB ? 1 : idA < idB ? -1 : 0;
  });
  
  return comments;
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
  const [usingImportedData, setUsingImportedData] = useState(false);
  const [commentTexts, setCommentTexts] = useState([]);

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

    // Calculate the comments.csv URL based on the participant-votes.csv URL
    const commentsUrl = dataUrl.replace('participant-votes.csv', 'comments.csv');
    
    // Helper function to handle proxy URL transformation
    const getProxiedUrl = (url) => {
      return url.startsWith("https://pol.is/") ? 
        url.replace("https://pol.is/", "http://localhost:3001/proxy/") : 
        url;
    };

    // Fetch both files in parallel
    Promise.all([
      fetch(getProxiedUrl(dataUrl))
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error fetching votes! Status: ${response.status}`);
          }
          return response.text();
        }),
      fetch(getProxiedUrl(commentsUrl))
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error fetching comments! Status: ${response.status}`);
          }
          return response.text();
        })
    ])
    .then(([votesData, commentsData]) => {
      console.log('Data fetched successfully');

      // Parse CSV to JSON with our custom parsers
      const { metadata, data: voteData } = parseCSV(votesData);
      const commentData = parseCommentsCSV(commentsData);
      
      console.log("Participant metadata:", metadata);
      console.log("Vote data:", voteData);
      console.log("Comment data:", commentData);

      // Set the vote matrix and comment texts with the imported data
      setVoteMatrix(voteData);
      setCommentTexts(commentData);
      
      // Mark that we're using imported data
      setUsingImportedData(true);

      setIsLoading(false);
    })
    .catch(error => {
      setUrlError(`Failed to fetch data: ${error.message}`);
      setIsLoading(false);
    });
  }, [dataUrl, setVoteMatrix]);

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
    if (!usingImportedData) {
      generateNewVoteMatrix();
    }
  }, [participants, comments, agreePercentage, disagreePercentage, 
      consensusGroups, groupSizes, groupSimilarity, 
      generateNewVoteMatrix, usingImportedData]);

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

  const handleReset = () => {
    setUsingImportedData(false);
    resetState();
  };

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

      {/* Comments Table */}
      {usingImportedData && commentTexts && commentTexts.length > 0 && (
        <div className="comments-table-container" style={{ marginBottom: '20px', maxHeight: 'calc(100vh - 300px)', overflow: 'scroll', maxWidth: '800px', border: '1px solid #ccc', margin: '20px auto' }}>
          <table className="comments-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Comment Text</th>
                <th>Agrees</th>
                <th>Disagrees</th>
                <th>Author</th>
              </tr>
            </thead>
            <tbody>
              {commentTexts.map((comment, index) => (
                <tr key={index} 
                    onClick={() => highlightComment(index)}
                    className={highlightedComment === index ? 'highlighted-comment' : ''}>
                  <td>{comment.id}</td>
                  <td>{comment.text}</td>
                  <td>{comment.agrees}</td>
                  <td>{comment.disagrees}</td>
                  <td>{comment.author_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h1>Vote Matrix and PCA Simulation</h1>
      <SimulationControls />
      <button onClick={handleReset}>Reset</button>
      <div className="data-source-indicator" style={{ marginBottom: '12px', fontStyle: 'italic', color: '#666' }}>
        {usingImportedData 
          ? `Currently showing imported data from CSV file (${voteMatrix ? voteMatrix.length : 0} participants)` 
          : 'Currently showing randomly generated data'}
      </div>

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