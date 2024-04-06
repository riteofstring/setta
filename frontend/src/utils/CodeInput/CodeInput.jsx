import { useEffect } from 'react';

const loadScript = (src, id) => {
  if (document.getElementById(id)) {
    return; // script already loaded
  }
  const script = document.createElement('script');
  script.src = src;
  script.id = id;
  document.head.appendChild(script);
  return script;
};

const loadStyle = (href, id) => {
  if (document.getElementById(id)) {
    return; // style already loaded
  }
  const link = document.createElement('link');
  link.href = href;
  link.id = id;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
  return link;
};

export const useCodeInput = () => {
  useEffect(() => {
    const script = loadScript('src/utils/CodeInput/code-input.min.js', 'code-input-script');
    const style = loadStyle('src/utils/CodeInput/code-input.min.css', 'code-input-style');
    const customStyle = loadStyle('src/utils/CodeInput/code-input.css', 'code-input-custom-style');

    script.onload = () => {
      if (window.codeInput) {
        window.codeInput.registerTemplate("syntax-highlighted", 
          new window.codeInput.Template(function(result_element) {
            // Initialization code here
          })
        );
      }
    };

    return () => {
      // Cleanup: Remove script, style, and any global modifications
      document.head.removeChild(script);
      document.head.removeChild(style);
      document.head.removeChild(customStyle);
      // Assume window.codeInput.cleanup() exists for cleanup purposes
      if (window.codeInput && window.codeInput.cleanup) {
        window.codeInput.cleanup();
      }
    };
  }, []);

  // Component or hook logic here
};
