// pdfParserService.js — PDF Parsing & Question Extraction Service
// Implements FEATURE-009: Question Boundary Detection & Visible Test Case Extraction
const { PDFParse } = require('pdf-parse');

/**
 * Extracts page-by-page text from a PDF Buffer.
 * Uses PDFParse to extract accurate text content per physical page.
 * @param {Buffer} dataBuffer 
 * @returns {Promise<{ numPages: number, pages: string[], fullText: string }>}
 */
async function extractPdfPages(dataBuffer) {
  let parser = null;
  try {
    parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    const pages = (result.pages || []).map((p) => p.text || '');
    return {
      numPages: result.total || pages.length || 1,
      pages,
      fullText: result.text || pages.join('\n\n'),
    };
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch (_) {}
    }
  }
}

/**
 * Regex patterns to detect question headings:
 * e.g., "Question: - 1", "Question - 1", "Question: 1", "Question 1", "Q1.", "Q 1:", "Problem 1", "Question No. 1", etc.
 * Interleaves optional punctuation (: - – — . #) and whitespace between prefix and number.
 */
const QUESTION_BOUNDARY_REGEX = /(?:^|\n|\r)\s*(?:Question|Problem|Q|Question\s*No\.?|Problem\s*No\.?)[\s:\-–—\.\#]*([0-9]+)\b[:\-–—\.\s]*/gi;

/**
 * Validates whether a regex match is a genuine question heading rather than
 * a coincidental line-wrap of prose mid-sentence (e.g. "...introduced earlier for\nQuestion 4 demonstrates...").
 * 
 * @param {string} fullText - Full page/document text
 * @param {number} matchIndex - Starting character index of the match
 * @param {number} matchLength - Length of matched heading string
 * @param {string} lineText - Entire line of text where the match occurred
 * @returns {boolean}
 */
function isValidQuestionHeading(fullText, matchIndex, matchLength, lineText) {
  // 1. Contextual Preceding Analysis:
  // If the match is not at the start of the text, inspect what immediately preceded it.
  if (matchIndex > 0) {
    const textBefore = fullText.slice(0, matchIndex);
    const prevLineMatch = textBefore.match(/([a-zA-Z0-9,;:-]+)\s*$/);
    const lastWord = prevLineMatch ? prevLineMatch[1].toLowerCase() : '';
    
    // Connecting words (prepositions, conjunctions, verbs, pronouns) indicate an in-flight sentence that wrapped
    const connectingWords = new Set([
      'for', 'to', 'see', 'in', 'and', 'or', 'of', 'with', 'on', 'at', 'from',
      'as', 'that', 'this', 'between', 'into', 'about', 'is', 'are', 'was', 'were',
      'the', 'a', 'an', 'by', 'than', 'like', 'such', 'per', 'via', 're', 'vs',
      'before', 'after', 'since', 'because', 'refer', 'compare', 'recalling', 'mentioning'
    ]);
    
    if (connectingWords.has(lastWord)) {
      return false; // Sentence continuation across wrapped lines
    }
  }

  const trimmedLine = lineText.trim();

  // 2. Standalone Heading Check:
  // The line contains ONLY the question heading (e.g., "Question: - 1", "Question 1", "Q1.", "Problem 2", "Question #3")
  const standaloneHeadingRegex = /^(?:Question|Problem|Q|Question\s*No\.?|Problem\s*No\.?)[\s:\-–—\.\#]*[0-9]+[\s:\-–—\.\#]*$/i;
  if (standaloneHeadingRegex.test(trimmedLine)) {
    return true;
  }

  // 3. Delimited Heading with Title:
  // Heading has explicit punctuation before or after the number (e.g. "Question: - 1", "Question 1: Two Sum", "Problem 2 - Reverse")
  const delimitedHeadingRegex = /^(?:Question|Problem|Q|Question\s*No\.?|Problem\s*No\.?)[\s:\-–—\.\#]+[0-9]+|^(?:Question|Problem|Q|Question\s*No\.?|Problem\s*No\S*)[0-9]+[\s]*[:\-–—\.\#]/i;
  if (delimitedHeadingRegex.test(trimmedLine)) {
    // Check if what follows the delimiter is an obvious flowing prose sentence starting with a lowercase verb/conjunction
    const proseFollowerRegex = /^(?:Question|Problem|Q|Question\s*No\.?|Problem\s*No\.?)[\s:\-–—\.\#]*[0-9]+[\s:\-–—\.\#]+([a-z]+)/i;
    const match = trimmedLine.match(proseFollowerRegex);
    if (match) {
      const nextWord = match[1];
      if (/^[a-z]/.test(nextWord)) {
        const commonProseWords = new Set([
          'demonstrates', 'which', 'was', 'is', 'gives', 'returns', 'has', 'had', 'shows',
          'requires', 'allows', 'asks', 'uses', 'calculates', 'can', 'will', 'should',
          'would', 'could', 'may', 'might', 'must', 'for', 'to', 'in', 'with', 'and',
          'or', 'that', 'this', 'where', 'when', 'if', 'then', 'because', 'since', 'after', 'before'
        ]);
        if (commonProseWords.has(nextWord.toLowerCase())) {
          return false;
        }
      }
    }
    return true;
  }

  // 4. Undelimited Heading with Title (e.g., "Question 1 Two Sum" vs "Question 4 demonstrates an optimal approach"):
  const undelimitedProseMatch = trimmedLine.match(/^(?:Question|Problem|Q)[\s]+[0-9]+[\s]+([a-z]+)/);
  if (undelimitedProseMatch) {
    const nextWord = undelimitedProseMatch[1].toLowerCase();
    const commonProseWords = new Set([
      'demonstrates', 'which', 'was', 'is', 'gives', 'returns', 'has', 'had', 'shows',
      'requires', 'allows', 'asks', 'uses', 'calculates', 'can', 'will', 'should',
      'would', 'could', 'may', 'might', 'must', 'for', 'to', 'in', 'with', 'and',
      'or', 'that', 'this', 'where', 'when', 'if', 'then', 'because', 'since', 'after', 'before'
    ]);
    if (commonProseWords.has(nextWord)) {
      return false; // Flowing lowercase prose verb/preposition -> reject
    }
  }

  return true;
}

/**
 * Parse a PDF buffer into distinct questions with page ranges and extracted visible test cases.
 * @param {Buffer} dataBuffer
 * @param {string} originalFileName
 * @returns {Promise<{ success: boolean, questions?: Array, totalPages?: number, reason?: string }>}
 */
async function parsePdfQuestions(dataBuffer, originalFileName = '') {
  try {
    const { numPages, pages } = await extractPdfPages(dataBuffer);

    if (numPages === 0 || pages.length === 0) {
      return {
        success: false,
        reason: 'PDF is empty or contains no readable pages.',
      };
    }

    // Step 1: Detect all question markers across pages
    const detectedMarkers = [];

    pages.forEach((pageText, pageIndex) => {
      const pageNumber = pageIndex + 1;
      let match;
      const regex = new RegExp(QUESTION_BOUNDARY_REGEX.source, 'gi');
      
      while ((match = regex.exec(pageText)) !== null) {
        const qNum = parseInt(match[1], 10);
        const matchIndex = match.index;
        const matchText = match[0];

        // Extract the full line containing the match
        const lineStart = pageText.lastIndexOf('\n', matchIndex) + 1;
        let lineEnd = pageText.indexOf('\n', matchIndex + matchText.length);
        if (lineEnd === -1) lineEnd = pageText.length;
        const lineText = pageText.slice(lineStart, lineEnd);

        // Apply heading authenticity safeguard
        if (!isValidQuestionHeading(pageText, matchIndex, matchText.length, lineText)) {
          console.log(`[PdfParser] Skipped prose wrap false-positive on page ${pageNumber}: "${matchText.trim()}" in line "${lineText.trim()}"`);
          continue;
        }

        detectedMarkers.push({
          questionNumber: qNum,
          pageNumber,
          charIndex: match.index,
          matchText: matchText.trim(),
          fullPageText: pageText,
        });
      }
    });

    // Fallback: If no explicit Question markers were found, check if the PDF has non-empty text content.
    // If it has text, treat the entire document as a single question spanning page 1 to numPages.
    if (detectedMarkers.length === 0) {
      const fullText = pages.join('\n\n').trim();
      if (!fullText) {
        return {
          success: false,
          reason: 'PDF text could not be extracted (document may be empty or contain only scanned raster images without OCR).',
        };
      }

      console.log(`[PdfParser] No explicit question boundary markers found in "${originalFileName}". Treating entire ${numPages}-page PDF as 1 question.`);
      const { visibleTestCases, status: exampleStatus } = extractVisibleTestCases(fullText);
      return {
        success: true,
        totalPages: numPages,
        questions: [
          {
            questionIndex: 1,
            questionNumber: 1,
            startPage: 1,
            endPage: numPages,
            questionText: fullText,
            visibleTestCases,
            exampleParsingStatus: exampleStatus,
          },
        ],
      };
    }

    // Step 2: Deduplicate markers (if any regex matched twice at same position) and sort by document flow
    const sortedMarkers = [...detectedMarkers].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.charIndex - b.charIndex;
    });

    console.log(`[PdfParser] Detected ${sortedMarkers.length} question markers in "${originalFileName}":`, sortedMarkers.map((m) => `Q${m.questionNumber}@p${m.pageNumber}`));

    // Step 3: Compute startPage and endPage for each detected question (Full Page Range Approach)
    const questions = [];

    for (let i = 0; i < sortedMarkers.length; i++) {
      const current = sortedMarkers[i];
      const next = sortedMarkers[i + 1];

      const startPage = current.pageNumber;
      let endPage;
      let questionText = '';

      if (!next) {
        // Last question in document spans to end of PDF
        endPage = numPages;
        const currentRestOfPage = pages[startPage - 1].slice(current.charIndex);
        const subsequentPages = pages.slice(startPage).join('\n\n');
        questionText = currentRestOfPage + (subsequentPages ? '\n\n' + subsequentPages : '');
      } else if (startPage === next.pageNumber) {
        // Both questions start on the same page
        endPage = startPage;
        questionText = pages[startPage - 1].slice(current.charIndex, next.charIndex);
      } else {
        // Next question starts on a later page
        if (next.charIndex < 120) {
          // Next question starts right at the top of next.pageNumber -> current question ended on previous page
          endPage = next.pageNumber - 1;
          const currentRestOfPage = pages[startPage - 1].slice(current.charIndex);
          const middlePages = pages.slice(startPage, next.pageNumber - 1).join('\n\n');
          questionText = [currentRestOfPage, middlePages].filter(Boolean).join('\n\n');
        } else {
          // Next question starts midway down next.pageNumber -> current question spans into next.pageNumber
          endPage = next.pageNumber;
          const currentRestOfPage = pages[startPage - 1].slice(current.charIndex);
          const middlePages = pages.slice(startPage, next.pageNumber - 1).join('\n\n');
          const nextPartialPage = pages[next.pageNumber - 1].slice(0, next.charIndex);
          questionText = [currentRestOfPage, middlePages, nextPartialPage].filter(Boolean).join('\n\n');
        }
      }

      // Step 4: Extract Visible Test Cases from Examples
      const { visibleTestCases, status: exampleStatus } = extractVisibleTestCases(questionText);

      questions.push({
        questionIndex: i + 1,
        questionNumber: current.questionNumber,
        startPage,
        endPage: Math.max(startPage, endPage),
        questionText: questionText.trim(),
        visibleTestCases,
        exampleParsingStatus: exampleStatus,
      });
    }

    return {
      success: true,
      totalPages: numPages,
      questions,
    };
  } catch (err) {
    console.error(`[PdfParser] Exception parsing "${originalFileName}":`, err);
    return {
      success: false,
      reason: `PDF parsing error: ${err.message}`,
    };
  }
}

/**
 * Extracts visible test cases from example sections in question text.
 * Handles single/multiple Example blocks, Input/Output labels, and variations.
 * @param {string} text
 * @returns {{ visibleTestCases: Array<{ input: string, expectedOutput: string }>, status: 'SUCCESS' | 'FAILED' | 'AMBIGUOUS' | 'NONE' }}
 */
function extractVisibleTestCases(text) {
  if (!text) {
    return { visibleTestCases: [], status: 'NONE' };
  }

  const hasExampleKeyword = /(?:example|sample|sample\s*test\s*case)/i.test(text);

  // If there is an explicit Example / Sample section, prioritize extracting from that section onwards
  // to avoid confusing problem statement input/output specifications with actual test cases
  let targetText = text;
  const exampleSectionMatch = text.match(/(?:^|\n)\s*(?:Examples?|Sample\s*Test\s*Cases?|Sample\s*Input(?:\s*\/\s*Output)?|Sample\s*1|Example\s*1)\b[\s:\-–—\.]*([\s\S]*)/i);
  if (exampleSectionMatch && exampleSectionMatch[1]) {
    targetText = exampleSectionMatch[0];
  }

  // Pattern 1: Standard Input: ... Output: ... pairs
  const inputOutputRegex = /(?:(?:Sample|Standard)?\s*Input\s*(?:Case\s*\d*)?[:\-–—]?\s*)([\s\S]*?)(?:(?:Sample|Standard)?\s*Output\s*(?:Case\s*\d*)?[:\-–—]?\s*)([\s\S]*?)(?=(?:(?:Sample|Standard)?\s*Input|Example\s*\d+|Explanation|Note|Constraints|Question|Problem|$))/gi;

  const testCases = [];
  let match;

  while ((match = inputOutputRegex.exec(targetText)) !== null) {
    let rawInput = (match[1] || '').trim();
    let rawOutput = (match[2] || '').trim();

    // Clean leading/trailing markdown code blocks if any
    rawInput = rawInput.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
    rawOutput = rawOutput.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();

    // If explanation is stuck to output, trim it
    const explanationMatch = rawOutput.match(/^(.*?)(?:\n\s*(?:Explanation|Note|Where):)/is);
    if (explanationMatch) {
      rawOutput = explanationMatch[1].trim();
    }

    // Trim trailing document running headers/footers if captured
    rawOutput = rawOutput.replace(/(?:\n|\r)\s*(?:GLOBUSSOFT|Page\s*\d+|Technology\s*Ahead).*$/is, '').trim();

    if (rawInput || rawOutput) {
      testCases.push({
        input: rawInput,
        expectedOutput: rawOutput,
      });
    }
  }

  if (testCases.length > 0) {
    return {
      visibleTestCases: testCases,
      status: 'SUCCESS',
    };
  }

  // If Example keyword was present but we couldn't parse any clean Input/Output pair
  if (hasExampleKeyword) {
    return {
      visibleTestCases: [],
      status: 'AMBIGUOUS',
    };
  }

  return {
    visibleTestCases: [],
    status: 'NONE',
  };
}

/**
 * Sanitizes a filename to create a clean Question Set name.
 * e.g., "globussoft_programming_questions.pdf" -> "globussoft programming questions"
 * @param {string} filename 
 * @returns {string}
 */
function sanitizeQuestionSetName(filename) {
  if (!filename) return 'Imported PDF Question Set';
  let name = filename.replace(/\.[^/.]+$/, ''); // remove extension
  // Replace underscores and multiple hyphens with single spaces
  name = name.replace(/[-_]+/g, ' ');
  name = name.replace(/[<>:"/\\|?*]+/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  return name || 'Imported PDF Question Set';
}

module.exports = {
  extractPdfPages,
  parsePdfQuestions,
  parsePdfDocument: parsePdfQuestions,
  extractVisibleTestCases,
  parseVisibleTestCasesFromText: (text) => {
    const res = extractVisibleTestCases(text);
    return {
      testCases: res.visibleTestCases,
      status: res.status,
    };
  },
  sanitizeQuestionSetName,
  isValidQuestionHeading,
};
