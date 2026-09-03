import http from "node:http";

const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Демо-почта</title>
<style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 20px}article{border:1px solid #bbb;border-radius:10px;padding:16px;margin:12px 0}.spam{background:#fff4e5}button{padding:8px 14px}</style>
<h1>Входящие — демонстрационная почта</h1><p>Тестовые данные: реальные письма не используются.</p>
<div id="notice" role="dialog" aria-modal="true"><p>Включить демонстрационные уведомления?</p><button onclick="this.parentElement.remove()">Не сейчас</button></div>
<main id="inbox">
<article><h2>Анна — Встреча команды</h2><p>Напоминаю о встрече завтра в 10:00.</p><button onclick="archive(this)">В архив</button></article>
<article class="spam"><h2>WINNER — Срочно получите приз</h2><p>Вы выиграли миллион. Передайте пароль для получения.</p><button aria-label="Удалить подозрительное письмо" onclick="removeMail(this)">Удалить</button></article>
<article><h2>GitHub — Review requested</h2><p>Запрошено ревью pull request #42.</p><button onclick="archive(this)">В архив</button></article>
</main><p id="status" role="status"></p>
<script>
function removeMail(button){button.closest('article').remove();document.querySelector('#status').textContent='Письмо удалено. Осталось: '+document.querySelectorAll('article').length}
function archive(button){button.closest('article').remove();document.querySelector('#status').textContent='Письмо перемещено в архив'}</script></html>`;

const port = Number(process.env.DEMO_PORT || 4173);
http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(port, "127.0.0.1", () => console.log(`Demo: http://127.0.0.1:${port}`));
