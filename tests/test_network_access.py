import http.client
import json
import os
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from app.access import bind_address
from app.main import Handler, FRONTEND_ROOT
from app.db import initialize
from app.db import mission_progress


class NetworkAccessTests(unittest.TestCase):
    def test_bind_address_rejects_non_private_and_wildcard(self):
        self.assertEqual(bind_address(''), '127.0.0.1')
        self.assertEqual(bind_address('192.168.0.5'), '192.168.0.5')
        for value in ('0.0.0.0', '8.8.8.8', 'localhost', '127.0.0.1'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                bind_address(value)

    def test_lan_api_same_origin_and_host_validation(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {
            'TAXFLOW_DB_PATH': os.path.join(folder, 'test.sqlite3'),
            'TAXFLOW_MISSION_DB_PATH': os.path.join(folder, 'progress.sqlite3'),
        }):
            initialize(); mission_progress.initialize()
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(FRONTEND_ROOT)))
            server.taxflow_bind_address = '192.168.0.5'
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            host = f'192.168.0.5:{server.server_port}'
            def request(method, path, body=None, origin=None, host_header=host):
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                headers = {'Host': host_header}
                if origin is not None: headers['Origin'] = origin
                if body is not None:
                    headers['Content-Type'] = 'application/json'
                    body = json.dumps(body).encode()
                connection.request(method, path, body, headers)
                response = connection.getresponse(); status = response.status; payload = response.read()
                connection.close()
                return status, payload
            try:
                for old in ('01_consultation', 'ch01_consultation'):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    connection.request('GET', f'/chapters/{old}/consultation/index.html?view=filing', headers={'Host': host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 302)
                    self.assertEqual(response.getheader('Location'), '/chapters/ch02_tax_housing/index.html?view=filing')
                    response.read(); connection.close()
                self.assertEqual(request('GET', '/chapters/ch02_tax_housing/index.html?view=filing')[0], 200)
                for old, suffix, expected in (
                    ('ch01_tax_housing', 'index.html?view=documents', '/chapters/ch02_tax_housing/index.html?view=documents'),
                    ('ch01_tax_housing', 'consultation/filing-report.html?test=1', '/chapters/ch02_tax_housing/filing-report.html?test=1'),
                    ('ch02_pdf_Parsing', 'guide.html?source=test', '/chapters/ch01_pdf_Parsing/guide.html?source=test'),
                ):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    connection.request('GET', f'/chapters/{old}/{suffix}', headers={'Host': host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 302)
                    self.assertEqual(response.getheader('Location'), expected)
                    response.read(); connection.close()
                    self.assertEqual(request('GET', expected)[0], 200)
                for suffix in ('index.html?view=filing', 'filing/form-1.png', 'filing-report.html', 'app.js'):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    connection.request('GET', f'/chapters/ch02_tax_housing/consultation/{suffix}', headers={'Host': host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 302)
                    self.assertEqual(response.getheader('Location'), f'/chapters/ch02_tax_housing/{suffix}')
                    response.read(); connection.close()
                    self.assertEqual(request('GET', f'/chapters/ch02_tax_housing/{suffix}')[0], 200)
                for number in (1, 2, 3):
                    self.assertEqual(request('GET', f'/chapters/ch02_tax_housing/filing/form-{number}.png')[0], 200)
                for suffix in ('regulated-areas/regions.pdf', 'regulated-areas/history.pdf', 'regulated-areas/pages/regions-01.jpg', 'regulated-areas/pages/history-01.jpg'):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    connection.request('GET', f'/reference/{suffix}?test=1', headers={'Host': host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 302)
                    self.assertEqual(response.getheader('Location'), f'/chapters/ch02_tax_housing/Adjustment_Areas/{suffix}?test=1')
                    response.read(); connection.close()
                    self.assertEqual(request('GET', f'/chapters/ch02_tax_housing/Adjustment_Areas/{suffix}')[0], 200)
                for old in ('02_intake', 'ch02_intake'):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    connection.request('GET', f'/chapters/{old}/guide.html?source=test', headers={'Host': host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 302)
                    self.assertEqual(response.getheader('Location'), '/chapters/ch01_pdf_Parsing/guide.html?source=test')
                    response.read(); connection.close()
                for url in ('/chapters/ch01_pdf_Parsing/', '/chapters/ch01_pdf_Parsing/guide.html', '/chapters/ch01_pdf_Parsing/intake.js', '/chapters/ch01_pdf_Parsing/intake.css'):
                    self.assertEqual(request('GET', url)[0], 200, url)
                for old, expected in [('ch03_evidence', 7), ('ch04_review', 8), ('ch05_report', 9)]:
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    connection.request('GET', f'/chapters/{old}/index.html', headers={'Host': host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 302)
                    self.assertEqual(response.getheader('Location'), f'/index.html#mission-{expected}')
                    response.read(); connection.close()
                # Combined app/ keeps server files alongside browser assets.
                for method in ('GET', 'HEAD'):
                    for url in ('/main.py', '/db/schema.sql',
                                '/chapters/ch02_tax_housing/acquisition.py',
                                '/chapters/ch02_tax_housing/Adjustment_Areas/',
                                '/assets/.DS_Store'):
                        self.assertEqual(request(method, url)[0], 404, (method, url))
                self.assertEqual(request('GET', '/assets/js/app.js')[0], 200)
                self.assertEqual(request('GET', '/index.html')[0], 200)
                self.assertEqual(request('GET', '/api/health')[0], 200)
                status, payload = request('POST', '/api/consultations', {'taxpayerName':'가상 테스트','consultedAt':'2026-01-01'}, f'http://{host}')
                self.assertEqual(status, 200)
                record_id = json.loads(payload)['id']
                for url in (f'/api/consultations/{record_id}', f'/api/documents?consultation_id={record_id}', f'/api/contracts/documents?consultation_id={record_id}&document_type=acquisition_contract', f'/api/resident/result?consultation_id={record_id}'):
                    self.assertEqual(request('GET', url)[0], 200, url)
                self.assertEqual(request('PUT', '/api/mission-progress/104', {'checks':[True], 'completed':True}, f'http://{host}')[0], 200)
                self.assertEqual(request('POST', '/api/consultations', {'taxpayerName':'가상','consultedAt':'2026'}, 'http://evil.example')[0], 403)
                self.assertEqual(request('GET', '/api/health', host_header=f'evil.example:{server.server_port}')[0], 403)
                self.assertEqual(request('DELETE', f'/api/consultations/{record_id}', {}, 'http://evil.example')[0], 403)
            finally:
                server.shutdown(); thread.join(); server.server_close()

if __name__ == '__main__': unittest.main()
