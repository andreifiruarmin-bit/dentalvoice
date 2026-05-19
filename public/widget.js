(function () {
  'use strict';

  var script = document.currentScript;
  var color = (script && script.getAttribute('data-color')) || '#2563eb';
  var buttonText = (script && script.getAttribute('data-button-text')) || 'Programează';
  var scriptSrc = script ? script.src : '';
  var baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/widget.js'));

  var isOpen = false;
  var iframeLoaded = false;

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = [
      '#dv-widget-btn {',
        'position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;',
        'border-radius: 50px; padding: 14px 22px;',
        'background: ' + color + '; color: #fff;',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        'font-size: 15px; font-weight: 600; border: none; cursor: pointer;',
        'box-shadow: 0 4px 20px rgba(0,0,0,0.18);',
        'display: flex; align-items: center; gap: 8px;',
        'transition: transform 0.15s ease, box-shadow 0.15s ease;',
      '}',
      '#dv-widget-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(0,0,0,0.22); }',
      '#dv-widget-iframe-wrap {',
        'position: fixed; bottom: 90px; right: 24px; z-index: 2147483646;',
        'width: 400px; height: 600px;',
        'border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.22);',
        'overflow: hidden; display: none; border: none;',
        'transition: opacity 0.2s ease, transform 0.2s ease;',
      '}',
      '#dv-widget-iframe-wrap.dv-open { display: block; }',
      '#dv-widget-iframe { width: 100%; height: 100%; border: none; display: block; }',
      '@media (max-width: 480px) {',
        '#dv-widget-iframe-wrap {',
          'width: calc(100vw - 32px); height: calc(100vh - 120px);',
          'right: 16px; bottom: 80px;',
        '}',
        '#dv-widget-btn { right: 16px; bottom: 16px; padding: 12px 18px; font-size: 14px; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function injectDOM() {
    var calendarIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

    var btn = document.createElement('button');
    btn.id = 'dv-widget-btn';
    btn.setAttribute('aria-label', buttonText);
    btn.innerHTML = calendarIcon + '<span id="dv-widget-btn-text">' + buttonText + '</span>';

    var wrap = document.createElement('div');
    wrap.id = 'dv-widget-iframe-wrap';

    var iframe = document.createElement('iframe');
    iframe.id = 'dv-widget-iframe';
    iframe.setAttribute('title', 'DentalVoice Chat');
    iframe.setAttribute('allow', 'microphone');
    // Preload chat — iframe rămâne încărcat (GDPR + conversație persistă în sesiune)
    iframe.src = baseUrl + '/embed/chat';
    iframeLoaded = true;

    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      isOpen = !isOpen;
      var btnText = document.getElementById('dv-widget-btn-text');

      if (isOpen) {
        wrap.classList.add('dv-open');
        if (btnText) btnText.textContent = '✕ Închide';
        btn.setAttribute('aria-expanded', 'true');
      } else {
        wrap.classList.remove('dv-open');
        if (btnText) btnText.textContent = buttonText;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    injectStyles();
    injectDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
