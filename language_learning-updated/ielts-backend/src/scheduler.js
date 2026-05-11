const { generateFromUnprocessedTexts } = require("./generateQuestions");

// Lightweight cron — no external dependency needed.
// Runs the job every day at the configured hour (default: midnight).

const SCHEDULE_HOUR = parseInt(process.env.SCHEDULE_HOUR || "0"); // 0 = midnight

let schedulerTimer = null;

function msUntilNextRun() {
  const now = new Date();
  const next = new Date();
  next.setHours(SCHEDULE_HOUR, 0, 0, 0);

  // If the scheduled time already passed today, move to tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next - now;
}

async function runJob() {
  const timestamp = new Date().toISOString();
  console.log(`\n⏰ [Scheduler] Running nightly generation job at ${timestamp}`);

  try {
    const count = await generateFromUnprocessedTexts();
    console.log(`⏰ [Scheduler] Job complete. ${count} questions generated.`);
  } catch (err) {
    console.error("⏰ [Scheduler] Job failed:", err.message);
  }

  // Schedule next run
  scheduleNext();
}

function scheduleNext() {
  const delay = msUntilNextRun();
  const nextRun = new Date(Date.now() + delay);
  console.log(`⏰ [Scheduler] Next run scheduled at ${nextRun.toLocaleString()}`);

  schedulerTimer = setTimeout(runJob, delay);
}

function startScheduler() {
  console.log(`\n⏰ [Scheduler] Started — daily generation at ${SCHEDULE_HOUR}:00`);
  scheduleNext();
}

function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    console.log("⏰ [Scheduler] Stopped.");
  }
}

module.exports = { startScheduler, stopScheduler };
