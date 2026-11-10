/**
 * 커리큘럼 위버 — 가입 승인 요청 메일 발송 (구글 Apps Script 웹 앱)
 *
 * 서버가 보낸 제목과 본문을 아래 TO 주소로 메일 한 통 보낸다. 받는 주소는 여기 고정되어 있어,
 * 웹 앱 주소가 알려져도 다른 주소로는 보낼 수 없다. 설정 방법: docs/승인-요청-메일-알림.md
 */
const TO = 'greatsong21@gmail.com';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || data.secret !== secret) return reply({ ok: false, error: 'unauthorized' });
    const subject = String(data.subject || '').slice(0, 200);
    const body = String(data.body || '').slice(0, 5000);
    if (!subject || !body) return reply({ ok: false, error: 'empty' });
    MailApp.sendEmail(TO, subject, body);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: 'error' });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
