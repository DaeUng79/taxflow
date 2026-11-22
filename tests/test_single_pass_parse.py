import base64,copy,io,json,unittest
from unittest.mock import patch
from app.chapters.ch02_pdf_Parsing import api

class SinglePassTests(unittest.TestCase):
    def make(self,**changes):
        value={'property':[],'payments':[],'seller':[],'buyer':[], 'contract_date':'2021.07.12.','contract_date_uncertain':False}
        value.update(changes);return value
    def test_one_model_call_and_contract_output(self):
        response=self.make(payments=[{'label':'잔금','value':'100,000,000원','payment_date':'2021.10.29.'}])
        urls=[]
        def mock(req,**kwargs):
            url=req if isinstance(req,str) else req.full_url;urls.append(url)
            payload={'data':[{'id':'Qwen3VL-8B-Instruct'}]} if url.endswith('/models') else {'choices':[{'message':{'content':json.dumps(response)},'finish_reason':'stop'}]}
            return io.BytesIO(json.dumps(payload).encode())
        with patch('urllib.request.urlopen',side_effect=mock): result=api.parse_image(base64.b64encode(b'\xff\xd8\xffsynthetic').decode())
        self.assertEqual(sum(url.endswith('/chat/completions') for url in urls),1)
        parsed=json.loads(result['text']);self.assertEqual(parsed['property'][0],{'label':'계약 체결일','value':'2021.07.12.','source':'model_unverified'})
        self.assertEqual(parsed['payments'][0]['payment_date'],'2021.10.29.')
    def test_unverified_contract_date_is_not_promoted(self):
        for flag in (True,None,'false'):
            with self.subTest(flag=flag):
                parsed=self.make(contract_date_uncertain=flag);warning=api.normalize_single_pass(parsed)
                self.assertTrue(warning[1]);self.assertEqual(parsed['property'],[])
        parsed=self.make(property=[{'label':'계약 체결일','value':'2022.02.01.'}]);self.assertTrue(api.normalize_single_pass(parsed)[1]);self.assertEqual(parsed['property'],[])
    def test_ambiguous_duplicate_and_blank_payment_dates(self):
        parsed=self.make(payments=[{'label':'계약금','value':'100원','payment_date':'2021.07.12.'},{'label':'잔금','value':'900원','payment_date':'2021.07.12.'},{'label':'중도금','value':'금 원정','payment_date':'2021.08.01.'}])
        date_warning,_,_=api.normalize_single_pass(parsed);self.assertTrue(date_warning)
        self.assertEqual([p['payment_date'] for p in parsed['payments']],['2021.07.12.','',''])
    def test_no_agreement_on_contract_date_does_not_infer_from_deposit(self):
        parsed=self.make(contract_date='',contract_date_uncertain=True,payments=[{'label':'계약금','value':'100원','payment_date':'2021.07.12.'}])
        _,warn,_=api.normalize_single_pass(parsed);self.assertTrue(warn);self.assertEqual(parsed['property'],[])
    def test_incomplete_response_rejected(self):
        def mock(req,**kwargs):
            url=req if isinstance(req,str) else req.full_url
            payload={'data':[{'id':'Qwen3VL-8B-Instruct'}]} if url.endswith('/models') else {'choices':[{'message':{'content':'{}'},'finish_reason':'stop'}]}
            return io.BytesIO(json.dumps(payload).encode())
        with patch('urllib.request.urlopen',side_effect=mock), self.assertRaises(RuntimeError):api.parse_image(base64.b64encode(b'\xff\xd8\xfftest').decode())
if __name__=='__main__':unittest.main()
