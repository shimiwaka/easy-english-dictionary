document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // 保存されているAPIキーを読み込む（キー名も geminiApiKey に変更します）
  chrome.storage.local.get(['geminiApiKey', 'openaiApiKey'], (result) => {
    // 互換性のため、もし古い openaiApiKey に AIzaSy が入っていたらそれを引き継ぐ
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    } else if (result.openaiApiKey && result.openaiApiKey.startsWith('AIzaSy')) {
      apiKeyInput.value = result.openaiApiKey;
    }
  });

  // 保存ボタンが押されたときの処理
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      statusDiv.textContent = '保存しました！';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 3000);
    });
  });
});