import Papa from 'papaparse';

export const parseVoteMatrixCSV = (csvString) => {
  // Use Papa Parse to parse the CSV properly
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
  })

  // Extract headers from the parse results
  const headers = parseResult.meta.fields

  // Initialize return objects
  const metadata = []
  const data = []

  // Process each row
  parseResult.data.forEach((row) => {
    // Extract metadata (first 6 columns)
    const participantMetadata = {
      participant: row["participant"] || "",
      "group-id": row["group-id"] || "",
      "n-comments": parseInt(row["n-comments"]) || 0,
      "n-votes": parseInt(row["n-votes"]) || 0,
      "n-agree": parseInt(row["n-agree"]) || 0,
      "n-disagree": parseInt(row["n-disagree"]) || 0,
    }
    metadata.push(participantMetadata)

    // Extract vote data (columns after the first 6)
    const voteData = headers.slice(6).map((header) => {
      const vote = row[header]
      // Convert to appropriate type: 1 for agree, -1 for disagree, 0 for pass/skip
      if (vote === "1") return 1
      if (vote === "-1") return -1
      return 0
    })

    data.push(voteData)
  })

  return { metadata, data }
}

export const parseCommentsCSV = (csvString) => {
  // Use Papa Parse to handle CSV parsing with proper escaping
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
  })

  // Map the parsed data to our comment structure
  const comments = parseResult.data.map((row) => ({
    timestamp: row["timestamp"] || "",
    datetime: row["datetime"] || "",
    id: row["comment-id"] || "",
    author_id: row["author-id"] || "",
    agrees: parseInt(row["agrees"]) || 0,
    disagrees: parseInt(row["disagrees"]) || 0,
    moderated: row["moderated"] || "",
    text: row["comment-body"] || "",
  }))

  // Sort comments by ID
  comments.sort((a, b) => {
    // If IDs are numeric, convert to numbers for comparison
    const idA = isNaN(Number(a.id)) ? a.id : Number(a.id)
    const idB = isNaN(Number(b.id)) ? b.id : Number(b.id)

    // Sort in ascending order
    return idA > idB ? 1 : idA < idB ? -1 : 0
  })

  return comments
}

export const parseVotesLogCSV = (csvString) => {
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
  })

  // Create a map of participant ID to their votes
  const participantVotes = {}

  parseResult.data.forEach((row) => {
    const participantId = row["voter-id"]
    const commentId = row["comment-id"]
    const vote = row["vote"]

    if (!participantVotes[participantId]) {
      participantVotes[participantId] = {}
    }

    participantVotes[participantId][commentId] = parseInt(vote, 10)
  })

  return participantVotes
}
