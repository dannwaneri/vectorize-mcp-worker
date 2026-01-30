/**
 * Intent Classifier Test Cases
 * 
 * Run these manually to validate classification accuracy
 */

const testCases = [
    // ENTITY_LOOKUP
    { query: "What's Haaland's player ID?", expected: "ENTITY_LOOKUP" },
    { query: "Find user John Smith", expected: "ENTITY_LOOKUP" },
    { query: "Show document titled Q3 Report", expected: "ENTITY_LOOKUP" },
    
    // SEMANTIC_SEARCH
    { query: "Players similar to Salah", expected: "SEMANTIC_SEARCH" },
    { query: "Documents about AI ethics", expected: "SEMANTIC_SEARCH" },
    { query: "Recommendations for fantasy team", expected: "SEMANTIC_SEARCH" },
    
    // KEYWORD_EXACT
    { query: "FPL Gameweek 17", expected: "KEYWORD_EXACT" },
    { query: "Error code 404", expected: "KEYWORD_EXACT" },
    { query: "Python numpy.array", expected: "KEYWORD_EXACT" },
    
    // GRAPH_REASONING
    { query: "Who owns Liverpool players?", expected: "GRAPH_REASONING" },
    { query: "Documents citing Smith 2020", expected: "GRAPH_REASONING" },
    { query: "Find related entities to X", expected: "GRAPH_REASONING" },
  ];
  
  // Test script (run via curl):
  // curl -X POST /classify-intent -d '{"query":"What is Haaland's ID?"}'