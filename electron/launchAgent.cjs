/**
 * Karne Gönderici Background LaunchAgent Daemon
 * macOS üzerinde uygulama kapalıyken belirlenen zamanlanmış görevleri denetler.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

function checkSchedule() {
  const schedulePath = path.join(os.homedir(), 'Library/Application Support/Karne Gonderici/schedule.json');
  if (!fs.existsSync(schedulePath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(schedulePath, 'utf8');
    const schedule = JSON.parse(raw);
    const now = Date.now();

    if (schedule && schedule.targetTimestamp && now >= schedule.targetTimestamp) {
      console.log(`[LaunchAgent] Zamanlanan saat geldi (${schedule.targetTimeString}). Uygulama uyandırılıyor...`);
      // Open the app to execute scheduled batch send
      exec('open -a "Karne Gonderici"', (err) => {
        if (err) console.error('[LaunchAgent] Uygulama açılamadı:', err);
      });
    }
  } catch (err) {
    console.error('[LaunchAgent] Hata:', err);
  }
}

checkSchedule();
