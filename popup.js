document.addEventListener('DOMContentLoaded', () => {
  const translateBtn = document.getElementById('translateBtn');
  const inputText = document.getElementById('inputText');
  const resultDiv = document.getElementById('result');
  const speakBtn = document.getElementById('speakBtn');
  const langToggle = document.getElementById('langToggle');
  const aiModeToggle = document.getElementById('aiModeToggle');
  const aiSection = document.getElementById('aiSection');
  const contextInput = document.getElementById('contextInput');
  const historyChips = document.getElementById('historyChips');

  let currentLangMode = 'ja-en';
  let isAiMode = false;
  let contextHistory = [];
  let apiKey = '';
  let lastTl = 'en';

  speakBtn.addEventListener('click', () => {
    const text = resultDiv.textContent.trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lastTl === 'en' ? 'en-US' : 'ja-JP';
    window.speechSynthesis.speak(utter);
  });

  function showResult(text) {
    resultDiv.textContent = text;
    speakBtn.style.display = 'block';
  }

  // 初期設定の読み込み
  chrome.storage.local.get(['isAiMode', 'contextHistory', 'geminiApiKey', 'openaiApiKey'], (result) => {
    if (result.isAiMode) {
      isAiMode = true;
      aiModeToggle.checked = true;
      updateAiUI();
    }
    if (result.contextHistory && Array.isArray(result.contextHistory)) {
      contextHistory = result.contextHistory;
      renderHistoryChips();
    }
    
    // キーの読み込み
    if (result.geminiApiKey) {
      apiKey = result.geminiApiKey;
    } else if (result.openaiApiKey && result.openaiApiKey.startsWith('AIzaSy')) {
      apiKey = result.openaiApiKey;
    }
  });

  // --- 言語トグルの処理 ---
  langToggle.addEventListener('click', () => {
    if (currentLangMode === 'ja-en') {
      currentLangMode = 'en-ja';
      langToggle.classList.remove('is-ja-en');
      langToggle.classList.add('is-en-ja');
      inputText.placeholder = "Enter English text to translate...";
    } else {
      currentLangMode = 'ja-en';
      langToggle.classList.remove('is-en-ja');
      langToggle.classList.add('is-ja-en');
      inputText.placeholder = "翻訳したい日本語を入力してください...";
    }
    if (inputText.value.trim().length > 0) translateBtn.click();
  });
  inputText.placeholder = "翻訳したい日本語を入力してください...";

  // --- AIモードトグルの処理 ---
  aiModeToggle.addEventListener('change', (e) => {
    isAiMode = e.target.checked;
    chrome.storage.local.set({ isAiMode: isAiMode });
    updateAiUI();
    if (inputText.value.trim().length > 0) translateBtn.click();
  });

  function updateAiUI() {
    if (isAiMode) {
      aiSection.classList.add('active');
      translateBtn.classList.add('ai-active');
      translateBtn.innerHTML = "✨ AI翻訳する (Gemini)";
    } else {
      aiSection.classList.remove('active');
      translateBtn.classList.remove('ai-active');
      translateBtn.innerHTML = "翻訳する (Translate)";
    }
  }

  // --- コンテキスト履歴の描画 ---
  function renderHistoryChips() {
    historyChips.innerHTML = '';
    contextHistory.forEach(ctx => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = ctx;
      chip.title = ctx;
      chip.addEventListener('click', () => {
        contextInput.value = ctx;
        if (inputText.value.trim().length > 0) translateBtn.click();
      });
      historyChips.appendChild(chip);
    });
  }

  function saveContextToHistory(ctx) {
    if (!ctx) return;
    contextHistory = contextHistory.filter(item => item !== ctx);
    contextHistory.unshift(ctx);
    if (contextHistory.length > 5) contextHistory.pop();
    
    chrome.storage.local.set({ contextHistory: contextHistory });
    renderHistoryChips();
  }

  // --- 翻訳実行処理 ---
  translateBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();

    if (!text) {
      resultDiv.innerHTML = "テキストを入力してください。";
      return;
    }

    resultDiv.innerHTML = "翻訳中...";

    let sl = currentLangMode === 'ja-en' ? 'ja' : 'en';
    let tl = currentLangMode === 'ja-en' ? 'en' : 'ja';
    lastTl = tl;
    let slName = currentLangMode === 'ja-en' ? 'Japanese' : 'English';
    let tlName = currentLangMode === 'ja-en' ? 'English' : 'Japanese';

    if (isAiMode) {
      // 最新のAPIキーを取得しておく
      chrome.storage.local.get(['geminiApiKey', 'openaiApiKey'], async (result) => {
        const currentKey = result.geminiApiKey || (result.openaiApiKey && result.openaiApiKey.startsWith('AIzaSy') ? result.openaiApiKey : apiKey);
        
        if (!currentKey) {
          resultDiv.innerHTML = `⚠️ Gemini APIキーが設定されていません。<br><button id="openOptionsBtn" class="link-btn">オプション画面</button>から設定してください。`;
          document.getElementById('openOptionsBtn').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
          });
          return;
        }

        const contextText = contextInput.value.trim();
        saveContextToHistory(contextText);

        try {
          // Gemini 2.5 Flashを使用します
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${currentKey}`;
          
          const prompt = `You are a highly skilled professional translator and proofreader. Output ONLY the final translated text without any conversational filler, explanations, or markdown code blocks.

Please translate the following text from ${slName} to ${tlName}. 
Do not just provide a literal translation. Instead, interpret the meaning and intent of the source text, and provide a translation that sounds completely natural, idiomatic, and professional to a native speaker of ${tlName}. Fix any unnatural phrasing, nuances, or grammatical awkwardness that a literal translation might cause.

${contextText ? `IMPORTANT Context / Instructions:\n${contextText}\n\n` : ''}Text to translate:\n${text}`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                temperature: 0.3
              }
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'API request failed');
          }

          const data = await response.json();
          
          // Geminiのレスポンス形式からテキストを抽出
          if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            showResult(data.candidates[0].content.parts[0].text.trim());
          } else {
            throw new Error('Unexpected API response structure');
          }

        } catch (error) {
          resultDiv.innerHTML = `⚠️ エラーが発生しました: ${error.message}`;
        }
      });
    } else {
      // 従来のGoogle翻訳（非公式API）
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        let translatedText = "";
        if (data && data[0]) {
          for (let i = 0; i < data[0].length; i++) {
            translatedText += data[0][i][0];
          }
        }
        showResult(translatedText);
      } catch (error) {
        resultDiv.innerHTML = `エラーが発生しました: ${error.message}`;
      }
    }
  });

  inputText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      translateBtn.click();
    }
  });
  
  contextInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      translateBtn.click();
    }
  });
});