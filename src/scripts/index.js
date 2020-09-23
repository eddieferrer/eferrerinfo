import '../styles/typography.scss';
import '../styles/index.scss';

if (process.env.NODE_ENV === 'development') {
  require('../index.html');
}

var elemYear = document.getElementById('js_year');
elemYear.innerHTML = new Date().getFullYear();

if (process.env.NODE_ENV === 'production') {
  (function (i, s, o, g, r, a, m) {
    i['GoogleAnalyticsObject'] = r; i[r] = i[r] || function () {
      (i[r].q = i[r].q || []).push(arguments);
    }, i[r].l = 1 * new Date(); a = s.createElement(o),
      m = s.getElementsByTagName(o)[0]; a.async = 1; a.src = g; m.parentNode.insertBefore(a, m);
  })(window, document, 'script', '//www.google-analytics.com/analytics.js', 'ga');
  
  ga('create', 'UA-75492234-1', 'auto');
  ga('send', 'pageview');
}
