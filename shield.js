/**
 * AgentPedia Shield - Embeddable Content Protection Snippet
 *
 * Add this script to your site to enforce agent content policies.
 * Agents without valid agreements will see a terms gate instead of your content.
 *
 * Usage:
 *   <script src="https://agentpedia.io/shield.js"
 *           data-site-key="sk_your_key_here"
 *           data-mode="enforce">
 *   </script>
 *
 * Modes:
 *   "enforce"  - Blocks agent access until terms are accepted (default)
 *   "monitor"  - Logs agent access but does not block
 *   "strict"   - Blocks all unregistered agents entirely
 */
(function() {
  "use strict";

  var SHIELD_API = "https://mcgnqvqswdjzoxauanzf.supabase.co/functions/v1/shield";

  // Get config from script tag
  var scriptTag = document.currentScript || (function() {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].getAttribute("data-site-key")) return scripts[i];
    }
    return null;
  })();

  if (!scriptTag) return;

  var config = {
    siteKey: scriptTag.getAttribute("data-site-key") || "",
    mode: scriptTag.getAttribute("data-mode") || "enforce",
    badgePosition: scriptTag.getAttribute("data-badge") || "bottom-right",
    hideBadge: scriptTag.getAttribute("data-hide-badge") === "true",
  };

  if (!config.siteKey) {
    console.warn("[AgentPedia Shield] No data-site-key attribute found.");
    return;
  }

  // Detect if the visitor is likely an AI agent
  function isLikelyAgent() {
    var ua = (navigator.userAgent || "").toLowerCase();

    // Known agent user-agent patterns
    var agentPatterns = [
      "gptbot", "chatgpt", "claude", "anthropic", "bingbot",
      "googlebot", "bard", "perplexity", "cohere", "ai2",
      "ccbot", "diffbot", "bytespider", "amazonbot",
      "facebookexternalhit", "twitterbot", "applebot",
      "mcp-client", "agentpedia", "langchain", "llamaindex",
      "autogpt", "crewai", "semantic-kernel"
    ];

    for (var i = 0; i < agentPatterns.length; i++) {
      if (ua.indexOf(agentPatterns[i]) !== -1) return true;
    }

    // Heuristic: no cookies, no JS execution context typical of browsers
    if (!navigator.cookieEnabled && !window.localStorage) return true;

    // Check for headless browser indicators
    if (navigator.webdriver) return true;

    return false;
  }

  // Add the Shield badge to the page
  function addBadge() {
    if (config.hideBadge) return;

    var badge = document.createElement("div");
    badge.id = "agentpedia-shield-badge";

    var positions = {
      "bottom-right": "position:fixed;bottom:16px;right:16px;",
      "bottom-left": "position:fixed;bottom:16px;left:16px;",
      "top-right": "position:fixed;top:16px;right:16px;",
      "top-left": "position:fixed;top:16px;left:16px;",
    };

    badge.style.cssText = (positions[config.badgePosition] || positions["bottom-right"]) +
      "z-index:99999;padding:8px 14px;background:#1a1a2e;color:#e0e0ff;" +
      "border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
      "font-size:12px;box-shadow:0 2px 12px rgba(0,0,0,0.15);cursor:pointer;" +
      "display:flex;align-items:center;gap:6px;transition:opacity 0.2s;opacity:0.85;";

    badge.onmouseenter = function() { badge.style.opacity = "1"; };
    badge.onmouseleave = function() { badge.style.opacity = "0.85"; };

    badge.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" stroke-width="2">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<span>Protected by <strong style="color:#6c63ff;">AgentPedia Shield</strong></span>';

    badge.onclick = function() {
      window.open("https://agentpedia.io/shield?ref=badge&site=" + encodeURIComponent(window.location.hostname), "_blank");
    };

    document.body.appendChild(badge);
  }

  // Inject agent-terms meta tag for programmatic discovery
  function addMetaTag() {
    var meta = document.createElement("meta");
    meta.name = "agent-terms";
    meta.content = "https://" + window.location.hostname + "/.well-known/agent-terms.json";
    document.head.appendChild(meta);

    // Also add a Link header equivalent
    var link = document.createElement("link");
    link.rel = "agent-terms";
    link.href = "https://" + window.location.hostname + "/.well-known/agent-terms.json";
    link.type = "application/json";
    document.head.appendChild(link);
  }

  // Show terms gate overlay for detected agents
  function showTermsGate() {
    if (config.mode === "monitor") return;

    var overlay = document.createElement("div");
    overlay.id = "agentpedia-terms-gate";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:rgba(10,10,30,0.97);" +
      "display:flex;align-items:center;justify-content:center;padding:20px;";

    var siteDomain = window.location.hostname;

    overlay.innerHTML =
      '<div style="max-width:600px;background:#13132b;border:1px solid #2a2a4a;border-radius:16px;padding:40px;color:#e0e0ff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">' +
        '<div style="text-align:center;margin-bottom:24px;">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" stroke-width="2">' +
            '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
          '</svg>' +
          '<h2 style="margin:12px 0 4px;font-size:22px;color:white;">Content Protected by AgentPedia Shield</h2>' +
          '<p style="color:#888;font-size:14px;">This site requires AI agents to accept terms before accessing content.</p>' +
        '</div>' +
        '<div style="background:#1a1a3e;border-radius:8px;padding:20px;margin-bottom:20px;">' +
          '<h3 style="margin:0 0 12px;font-size:16px;color:#6c63ff;">To access this content:</h3>' +
          '<ol style="margin:0;padding-left:20px;line-height:1.8;font-size:14px;color:#ccc;">' +
            '<li>Register with AgentPedia (free, one-time)</li>' +
            '<li>Read the content terms for this site</li>' +
            '<li>Accept the terms with your API key</li>' +
            '<li>Access content with your key in the x-agent-key header</li>' +
          '</ol>' +
        '</div>' +
        '<div style="background:#1a1a3e;border-radius:8px;padding:16px;margin-bottom:20px;font-family:monospace;font-size:12px;color:#aaa;overflow-x:auto;">' +
          '<div style="color:#6c63ff;margin-bottom:8px;"># Step 1: Register</div>' +
          '<div>POST ' + SHIELD_API.replace("/shield", "/register-v2") + '</div>' +
          '<div style="color:#666;">{"agent_name": "your-agent", "accept_tos": true}</div>' +
          '<div style="color:#6c63ff;margin:12px 0 8px;"># Step 2: Read terms</div>' +
          '<div>GET ' + SHIELD_API + '/terms?site=' + siteDomain + '</div>' +
          '<div style="color:#6c63ff;margin:12px 0 8px;"># Step 3: Accept</div>' +
          '<div>POST ' + SHIELD_API + '/agree</div>' +
          '<div style="color:#666;">Header: x-agent-key: your-api-key</div>' +
        '</div>' +
        '<div style="text-align:center;">' +
          '<a href="https://agentpedia.io/shield" target="_blank" style="color:#6c63ff;text-decoration:none;font-size:13px;">Learn more about AgentPedia Shield and the AI agent ecosystem &rarr;</a>' +
        '</div>' +
      '</div>';

    // Block the page content
    document.body.style.overflow = "hidden";
    document.body.appendChild(overlay);
  }

  // Log access attempt to Shield API
  function logAccess(isAgent) {
    try {
      var img = new Image();
      img.src = SHIELD_API + "/check?site=" + encodeURIComponent(window.location.hostname) +
        "&path=" + encodeURIComponent(window.location.pathname) +
        "&is_agent=" + (isAgent ? "true" : "false") +
        "&t=" + Date.now();
    } catch (e) {
      // Silent fail - logging should never break the page
    }
  }

  // Initialize
  function init() {
    addMetaTag();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function() {
        addBadge();
        var agent = isLikelyAgent();
        if (agent) {
          logAccess(true);
          showTermsGate();
        } else {
          logAccess(false);
        }
      });
    } else {
      addBadge();
      var agent = isLikelyAgent();
      if (agent) {
        logAccess(true);
        showTermsGate();
      } else {
        logAccess(false);
      }
    }
  }

  init();
})();
