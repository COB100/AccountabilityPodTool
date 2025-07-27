// --- Application State & Configuration ---
const LOCAL_STORAGE_KEY = 'accountabilityPodAppData_v3_12';
const INITIAL_DATA_FILE_PATH = 'accountability-pod-data.json';
let appData = {
    members: [],
    nextCallContent: {
        dadJoke: "Why did the scarecrow win an award? Because he was outstanding in his field!",
        intentionQuestion: "What small risk can you take this week that could lead to a big reward?"
    }
};
let callOrder = [];
let currentHotseatIndex = 0;
let currentIntentionIndex = 0;
let activeTimers = {};

// DOM Elements
const aiJsonInput = document.getElementById('ai-json-input');
const jsonSubmitBtn = document.getElementById('json-submit-btn');
const jsonResubmitBtn = document.getElementById('json-resubmit-btn');
const aiProcessingStatusDiv = document.getElementById('ai-processing-status');
const aiPromptOutput = document.getElementById('ai-prompt-output');
const copyPromptBtn = document.getElementById('copy-prompt-btn');
const saveDataPromptDiv = document.getElementById('save-data-prompt');
const importFileInput = document.getElementById('import-file-input');


// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadAppDataFromLocalStorage();
    if (importFileInput) {
        importFileInput.addEventListener('change', handleImportFile);
    }
    navigate('home');
});

async function loadAppDataFromLocalStorage() {
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedData) {
        try {
            const loaded = JSON.parse(storedData);
            const defaultMemberStructure = { xp: 0, streak: 0, currentGoals: [], currentCommitments: [], previousScore: "N/A" };
            appData.members = (loaded.members || []).map(m => ({
                ...defaultMemberStructure,
                ...m,
                avatar: m.avatar || `avatars/${m.name}.png`
            }));
            appData.nextCallContent = { ...appData.nextCallContent, ...(loaded.nextCallContent || {}) };
            console.log("App data loaded from localStorage:", appData);
        } catch (e) {
            console.error("Error parsing data from localStorage, attempting to load from file or using defaults.", e);
            await loadInitialFileOrUseDefaults();
        }
    } else {
        console.log("No data in localStorage. Attempting to load from initial JSON file or using defaults.");
        await loadInitialFileOrUseDefaults();
    }
    renderLeaderboard();
}

async function loadInitialFileOrUseDefaults() {
    try {
        const response = await fetch(INITIAL_DATA_FILE_PATH);
        if (response.ok) {
            const fileData = await response.json();
            const defaultMemberStructure = { xp: 0, streak: 0, currentGoals: [], currentCommitments: [], previousScore: "N/A" };
            appData.members = (fileData.members || []).map(m => ({
                ...defaultMemberStructure,
                ...m,
                avatar: m.avatar || `avatars/${m.name}.png`
            }));
            appData.nextCallContent = { ...appData.nextCallContent, ...(fileData.nextCallContent || {}) };
            console.log("Initial data loaded from accountability-pod-data.json and will be saved to localStorage.");
        } else {
            console.warn("Initial accountability-pod-data.json not found (or error), using script defaults.");
            initializeDefaultAppData();
        }
    } catch (error) {
        console.warn("Error fetching initial accountability-pod-data.json, using script defaults.", error);
        initializeDefaultAppData();
    }
    saveAppDataToLocalStorage();
}


function saveAppDataToLocalStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appData));
        console.log("App data saved to localStorage.");
        if (saveDataPromptDiv) saveDataPromptDiv.style.display = 'none';
    } catch (e) {
        console.error("Error saving data to localStorage:", e);
        const statusMsg = "Error: Could not save data to browser storage. Storage might be full or private browsing mode is active.";
        if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = statusMsg;
        
        if (saveDataPromptDiv) {
            saveDataPromptDiv.innerHTML = `<p style="color:red;">${statusMsg} Please download your data manually:</p>
                                           <button class="btn" onclick="downloadMemberData()">Download Data File</button>`;
            saveDataPromptDiv.style.display = 'block';
        } else {
            alert(statusMsg + " Please use Export Data for manual backup.");
        }
    }
}

function initializeDefaultAppData() {
    const defaultMemberNames = ["Hannah", "Connor", "Brian", "Jordan", "Lane", "James", "Jeremy", "Rob"];
    appData.members = defaultMemberNames.map(name => ({
        name: name,
        avatar: `avatars/${name}.png`,
        xp: 0,
        streak: 0,
        currentGoals: [], // These are for the *upcoming* week
        currentCommitments: [], // These are for the *upcoming* week
        previousScore: "N/A" // Score for the week just *completed*
    }));
    console.log("Initialized with default app data (will be saved to localStorage):", appData);
}

// --- UI & Application Logic ---
function navigate(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('visible'));
    const section = document.getElementById(id);
    if (section) section.classList.add('visible');
    else console.error("Section not found:", id);

    if (id === 'home') renderLeaderboard();
    if (id === 'aiDataInput') {
        if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = '';
    }
}

function renderLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard');
    if (!appData.members || appData.members.length === 0) {
        leaderboardDiv.innerHTML = 'No member data available. Load data, import, or process AI output.';
        return;
    }
    const sortedMembers = [...appData.members].sort((a, b) => b.xp - a.xp);
    leaderboardDiv.innerHTML = sortedMembers.map(m => `
        <div class="leaderboard-entry">
          <img class='avatar' src='${m.avatar}' alt='${m.name} avatar' onerror="this.src='avatars/default.png'; this.onerror=null;">
          <div class="leaderboard-info">
            <span class="leaderboard-name">${m.name}</span><br>
            <span class="leaderboard-stats">XP: ${m.xp} | Streak: ${m.streak} weeks</span>
          </div>
        </div>
    `).join('');
}

async function startCall() {
    document.getElementById('dad-joke').textContent = appData.nextCallContent.dadJoke;
    document.getElementById('intention-q-display').textContent = appData.nextCallContent.intentionQuestion;
    document.getElementById('intention-q-speaker').textContent = appData.nextCallContent.intentionQuestion;

    callOrder = [];
    currentHotseatIndex = 0;
    currentIntentionIndex = 0;

    navigate('checkin');
    const attendanceDiv = document.getElementById('attendance');
    if (!appData.members || appData.members.length === 0) {
        attendanceDiv.innerHTML = "<p>No members loaded. Please check data or import.</p>";
        return;
    }
    attendanceDiv.innerHTML = appData.members.map((m, i) => `
        <label>
          <input type='checkbox' id='att-${i}' data-member-name='${m.name}' checked>
          <img class='avatar' src='${m.avatar}' alt='${m.name} avatar' onerror="this.src='avatars/default.png'; this.onerror=null;">
          ${m.name}
        </label>
    `).join('');
    
    const nextButton = document.getElementById('checkin-next-button');
    nextButton.textContent = 'Finalize Attendance';
    nextButton.onclick = finalizeAttendance;
    nextButton.disabled = false;
    document.getElementById('call-order-display').innerHTML = '';
    startTimer('checkin-timer', 300);
}

function shuffleArray(array) { 
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function finalizeAttendance() { 
    const presentMemberNames = [];
    document.querySelectorAll('#attendance input[type="checkbox"]:checked').forEach(checkbox => {
        presentMemberNames.push(checkbox.dataset.memberName);
    });
    callOrder = appData.members
        .filter(m => presentMemberNames.includes(m.name))
        .map(m => ({ ...m })); 
    shuffleArray(callOrder);
    const orderDisplay = document.getElementById('call-order-display');
    const nextButton = document.getElementById('checkin-next-button');
    if (callOrder.length > 0) {
        orderDisplay.innerHTML = `<strong>Randomized Call Order:</strong> ${callOrder.map(m => m.name).join(' → ')}`;
        nextButton.textContent = 'Start Intention Round';
        nextButton.onclick = () => { nextIntention(); };
    } else {
        orderDisplay.innerHTML = '<strong>No members present.</strong>';
        nextButton.disabled = true;
    }
    skipTimer('checkin-timer');
}

function nextIntention() { 
    if (currentIntentionIndex >= callOrder.length) {
        currentHotseatIndex = 0;
        nextHotSeat();
        return;
    }
    const memberFromCallOrder = callOrder[currentIntentionIndex];
    const memberData = appData.members.find(m => m.name === memberFromCallOrder.name); 

    document.getElementById('intention-name').textContent = memberData.name;
    document.getElementById('intention-avatar').src = memberData.avatar;
    document.getElementById('intention-stats').innerHTML = `XP: ${memberData.xp} | Streak: ${memberData.streak} weeks`;
    
    currentIntentionIndex++;
    navigate('intention');
    startTimer('intention-timer', 120);
}

// MODIFIED FUNCTION FOR NEW HOTSEAT QUESTIONS
function nextHotSeat() { 
    if (currentHotseatIndex >= callOrder.length) {
        navigate('wrapup');
        startTimer('wrapup-timer', 300); 
        return;
    }
    const memberFromCallOrder = callOrder[currentHotseatIndex];
    const memberData = appData.members.find(m => m.name === memberFromCallOrder.name); 

    document.getElementById('hotseat-name').textContent = memberData.name;
    document.getElementById('hotseat-avatar').src = memberData.avatar;

    // The `currentGoals` and `currentCommitments` on memberData are for *THIS UPCOMING WEEK*
    // (i.e., what was set at the end of the *last* call / AI processing).
    // "Last Week, I committed to..." refers to the goals/commitments that were active
    // for the week that just concluded. For simplicity in display here without storing
    // an additional N-1 set of goals, we'll imply that the AI prompt handled this context.
    // The prompt asks AI for a `scoreForThisWeek` based on those N-1 goals.
    // The `currentGoals` and `currentCommitments` displayed are what they are working on *now*.

    let hotseatHTML = `
        <div id="hotseat-member-data">
          <p><strong>XP:</strong> ${memberData.xp} | <strong>Streak:</strong> ${memberData.streak}</p>
          <p><strong>Current Quarterly Goals (if available, from member's input):</strong>
            <em>(Member to state these based on question 1)</em>
          </p>
          <p><strong>Commitments & Weekly Ones (for this week, from last AI processing):</strong></p>
          <ul>${memberData.currentCommitments.length > 0 ? memberData.currentCommitments.map(c => `<li>${c}</li>`).join('') : '<li>No specific weekly commitments set.</li>'}</ul>
          <!-- Display currentGoals separately if they are distinct from commitments -->
          ${memberData.currentGoals.length > 0 && memberData.currentGoals.join('') !== memberData.currentCommitments.join('') ? 
            `<p><strong>General Goals (for this week, from last AI processing):</strong></p>
             <ul>${memberData.currentGoals.map(g => `<li>${g}</li>`).join('')}</ul>` 
            : ''}
        </div>
        <div id="hotseat-questions-list">
          <h4>Hot Seat Questions:</h4>
          <ol>
            <li>What are your top 3 goals for the quarter?</li>
            <li>Last Week, I committed to... <em>(Member to reflect on what their actual previous commitments were. The AI prompt includes last week's commitments for context when calculating the score.)</em></li>
            <li>What was my score last week? (Score: ${memberData.previousScore})</li>
            <li>What habits did I do well with?</li>
            <li>What habits did I struggle with?</li>
            <li>What am I committing to this week AND What are my Weekly Ones? <em>(AI will extract new commitments/weekly ones from this response)</em></li>
          </ol>
        </div>`;
    document.getElementById('hotseat-details').innerHTML = hotseatHTML;
    currentHotseatIndex++;
    navigate('hotseat');
    startTimer('hotseat-timer', 300);
}
// END OF MODIFIED FUNCTION

function startTimer(timerId, seconds) { /* ... same ... */ 
    clearInterval(activeTimers[timerId]);
    const el = document.getElementById(timerId);
    if (!el) { console.error("Timer element not found:", timerId); return; }
    let remainingSeconds = seconds;
    const tick = () => {
        let m = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
        let s = String(remainingSeconds % 60).padStart(2, '0');
        el.textContent = `${m}:${s}`;
        if (--remainingSeconds < 0) {
            clearInterval(activeTimers[timerId]);
            el.textContent = "00:00";
        }
    }
    tick();
    activeTimers[timerId] = setInterval(tick, 1000);
}
function skipTimer(timerId) { /* ... same ... */ 
    clearInterval(activeTimers[timerId]);
    const el = document.getElementById(timerId);
    if (el) el.textContent = "00:00";
}

// --- AI Data Input Section Logic ---

// MODIFIED FUNCTION FOR AI PROMPT
function displayAIPrompt() { 
    const memberContextList = appData.members.map(m => 
        `- ${m.name} (Current XP: ${m.xp}, Current Streak: ${m.streak}, Commitments/Goals for week just ENDED: [${m.currentCommitments.join("; ")}] & [${m.currentGoals.join("; ")}])`
    ).join("\n");

    const prompt = `
CONTEXT: You are an AI assistant for an accountability pod. The members have just completed a week and are reporting on it, then setting commitments for the next week.

INSTRUCTIONS:
1.  Review "POD MEMBERS (with current stats...)" to understand each member's starting point for XP, streak, and what their commitments/goals were for the week that JUST ENDED.
2.  Analyze the "MEETING TRANSCRIPT/SUMMARY" to determine which of these members were PRESENT and actively participated.
3.  For EACH "Pod Member" listed:
    a.  Determine their NEW TOTAL XP:
        - Start with their "Current XP".
        - If PRESENT (based on your transcript analysis):
            - Add +10 XP for attendance.
            - Add +5 XP for Hot Seat completion (assume completed if they discussed their progress or set new commitments/weekly ones).
            - If their NEW streak (calculated in step 3b) becomes a multiple of 4 (e.g., 4, 8, 12), add +10 bonus XP.
    b.  Determine their NEW TOTAL STREAK:
        - Start with their "Current Streak".
        - If PRESENT (based on your transcript analysis): Add +1 to their streak.
        - If ABSENT (or no clear indication of presence for this call in the transcript): Reset streak to 0.
    c.  Extract their STATED SCORE for the week JUST COMPLETED (e.g., "my score for last week was 85%"). This score should reflect how they performed against their "Commitments/Goals for week just ENDED" (provided in their context line). If not explicitly stated or unclear, set to "N/A".
    d.  Extract up to 3-5 NEW COMMITMENTS and/or WEEKLY ONES they set for the UPCOMING week. Group these together. If none explicitly set or unclear, set to ["Unknown - AI could not determine commitments/weekly ones"].
    e.  Optionally, if they state "Top 3 goals for the quarter", extract these as "quarterlyGoals". If not stated, this can be omitted or set to []. This is secondary to weekly commitments.
4.  Identify ONE PRESENT member for "Insightful Question". Add +3 XP to THIS member's NEW TOTAL XP calculated in step 3a. State who this winner is.
5.  Generate one new, short, SFW "Dad Joke" for the next call.
6.  Generate one new, concise "Intention Question" for the next call.

INPUTS (User pastes transcript below this entire prompt):
A. This prompt.
B. Meeting transcript/summary.

POD MEMBERS (with current stats from end of last call and commitments for the week just ended):
${memberContextList} 

DESIRED JSON OUTPUT STRUCTURE (Provide ONLY this JSON object, no extra text or markdown):
{
  "nextCallContent": {
    "dadJoke": "Generated Dad Joke here",
    "intentionQuestion": "Generated Intention Question here"
  },
  "members": [
    {
      "name": "Member Name",
      "newTotalXP": <number>,
      "newTotalStreak": <number>,
      "scoreForThisWeek": "XX%" or "N/A", 
      "newCommitmentsAndWeeklyOnes": ["Commitment/Weekly One 1", ...], // Combined list
      "quarterlyGoals": ["Quarterly Goal 1", ...] // Optional, only if stated
    }
    // ... include an object for EVERY member listed in "POD MEMBERS" above
  ],
  "insightfulQuestionWinner": "Winner's Name" or null 
}

EXAMPLE:
{
  "name": "Hannah",
  "newTotalXP": 148, 
  "newTotalStreak": 4, 
  "scoreForThisWeek": "90%",
  "newCommitmentsAndWeeklyOnes": ["Daily meditation", "Call 5 clients"],
  "quarterlyGoals": ["Launch new product line"]
}
If a member was absent: 'newTotalXP' = 'Current XP', 'newTotalStreak' = 0. 'scoreForThisWeek' = "N/A". 'newCommitmentsAndWeeklyOnes' should be their existing ones (no change). 'quarterlyGoals' would also be their existing ones or empty if never set.
---END OF PROMPT---
PASTE YOUR MEETING TRANSCRIPT/SUMMARY BELOW THIS LINE:
`;
    aiPromptOutput.textContent = prompt;
    aiPromptOutput.style.display = 'block';
    copyPromptBtn.style.display = 'inline-block';
}
// END OF MODIFIED AI PROMPT FUNCTION

function copyAIPrompt() { /* ... same ... */ 
    const promptText = aiPromptOutput.textContent;
    if (navigator.clipboard && window.isSecureContext) { 
        navigator.clipboard.writeText(promptText).then(() => {
            alert('Prompt copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy prompt: ', err);
            fallbackCopyTextToClipboard(promptText); 
        });
    } else { 
        fallbackCopyTextToClipboard(promptText);
    }
}

function fallbackCopyTextToClipboard(text) { /* ... same ... */
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        const msg = successful ? 'Prompt copied to clipboard! (fallback method)' : 'Failed to copy prompt (fallback method)';
        alert(msg);
    } catch (err) {
        console.error('Fallback copy failed: ', err);
        alert('Failed to copy prompt. Please copy manually.');
    }
    document.body.removeChild(textArea);
 }

// MODIFIED FUNCTION TO PARSE NEW JSON STRUCTURE
async function submitAIData() {
    const jsonInput = aiJsonInput.value.trim();
    if (!jsonInput) {
        if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = "Please paste the AI-generated JSON data.";
        return;
    }
    aiJsonInput.readOnly = true;
    jsonSubmitBtn.disabled = true;
    jsonResubmitBtn.disabled = false;
    if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = "Processing submitted AI data...";
    if (saveDataPromptDiv) saveDataPromptDiv.style.display = 'none';

    try {
        const aiData = JSON.parse(jsonInput);

        if (!aiData.members || !Array.isArray(aiData.members)) {
            throw new Error("Submitted JSON is missing the 'members' array or it's not an array.");
        }
        
        if (aiData.nextCallContent && typeof aiData.nextCallContent.dadJoke === 'string' && typeof aiData.nextCallContent.intentionQuestion === 'string') {
            appData.nextCallContent.dadJoke = aiData.nextCallContent.dadJoke;
            appData.nextCallContent.intentionQuestion = aiData.nextCallContent.intentionQuestion;
        } else {
            console.warn("AI JSON is missing 'nextCallContent' or its fields. Using existing/default joke/question for next call.");
        }

        aiData.members.forEach(aiMemberData => {
            const memberIndex = appData.members.findIndex(m => m.name === aiMemberData.name);
            if (memberIndex !== -1) {
                appData.members[memberIndex].xp = parseInt(aiMemberData.newTotalXP) || appData.members[memberIndex].xp;
                appData.members[memberIndex].streak = parseInt(aiMemberData.newTotalStreak) || 0; 
                
                // AI now provides "newCommitmentsAndWeeklyOnes"
                // For simplicity, we'll store these in `currentCommitments`. 
                // `currentGoals` can store the `quarterlyGoals` if AI provides them, or remain for general goals.
                const commitmentsFromAI = Array.isArray(aiMemberData.newCommitmentsAndWeeklyOnes) ? aiMemberData.newCommitmentsAndWeeklyOnes : [];
                appData.members[memberIndex].currentCommitments = commitmentsFromAI.length > 0 && commitmentsFromAI[0].toLowerCase() !== "unknown - ai could not determine commitments/weekly ones" 
                    ? [...commitmentsFromAI] 
                    : [];
                
                const quarterlyGoalsFromAI = Array.isArray(aiMemberData.quarterlyGoals) ? aiMemberData.quarterlyGoals : [];
                // If AI returns quarterly goals, we can store them. If you want to keep the old `currentGoals` if no quarterly goals are provided,
                // you'd need more nuanced logic or instruct AI to return existing goals if no new quarterly ones.
                // For now, let's assume `currentGoals` will be for quarterly goals if provided, else empty or what AI sends.
                if (quarterlyGoalsFromAI.length > 0 && quarterlyGoalsFromAI[0].toLowerCase() !== "unknown - ai could not determine goals") { // A check if AI explicitly says unknown
                    appData.members[memberIndex].currentGoals = [...quarterlyGoalsFromAI];
                } else if (quarterlyGoalsFromAI.length === 0 && aiMemberData.hasOwnProperty('quarterlyGoals')) { 
                     // AI explicitly provided an empty array for quarterlyGoals, so clear existing ones.
                    appData.members[memberIndex].currentGoals = [];
                }
                // If `aiMemberData.quarterlyGoals` is undefined, currentGoals remain untouched from previous state.

                appData.members[memberIndex].previousScore = aiMemberData.scoreForThisWeek || "N/A";
            }
        });
        
        if (aiData.insightfulQuestionWinner) {
            console.log(`AI identified ${aiData.insightfulQuestionWinner} as the insightful question winner. Their XP should reflect this as calculated by AI.`);
        }

        saveAppDataToLocalStorage();
        if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = "AI data processed and auto-saved to browser!";
        renderLeaderboard();

    } catch (error) {
        console.error("Error processing AI JSON data:", error);
        if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = `Error parsing or processing JSON: ${error.message}. Please check format.`;
        unlockAIJsonInput();
    }
}
// END OF MODIFIED PARSING FUNCTION

function unlockAIJsonInput() { /* ... same ... */
    aiJsonInput.readOnly = false;
    aiJsonInput.value = ""; 
    jsonSubmitBtn.disabled = false;
    jsonResubmitBtn.disabled = true;
    if (aiProcessingStatusDiv) aiProcessingStatusDiv.textContent = "";
    if (saveDataPromptDiv) saveDataPromptDiv.style.display = 'none';
}

function downloadMemberData() { /* ... same ... */
    const jsonData = JSON.stringify(appData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = INITIAL_DATA_FILE_PATH;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert("Data exported as " + INITIAL_DATA_FILE_PATH + ". Save this file as a backup.");
}

function handleImportFile(event) { /* ... same ... */
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedText = e.target.result;
                const importedData = JSON.parse(importedText);
                
                if (importedData && importedData.members && Array.isArray(importedData.members) && importedData.nextCallContent) {
                    const defaultMemberStructure = { xp: 0, streak: 0, currentGoals: [], currentCommitments: [], previousScore: "N/A" };
                    appData.members = (importedData.members || []).map(m => ({
                        ...defaultMemberStructure,
                        ...m,
                        avatar: m.avatar || `avatars/${m.name}.png`
                    }));
                    appData.nextCallContent = { ...appData.nextCallContent, ...(importedData.nextCallContent || {}) };
                    
                    saveAppDataToLocalStorage();
                    renderLeaderboard();
                    alert("Data imported successfully and saved to browser storage!");
                } else {
                    alert("Invalid data file structure. Could not import.");
                }
            } catch (ex) {
                alert("Error reading or parsing import file: " + ex.message);
            }
        };
        reader.readAsText(file);
    }
    if (event.target) event.target.value = null;
}