"""Offline tests for the opt-in proxy. No Yandex requests."""
import io, json, os, sys, unittest, urllib.error
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import index

class Response:
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self, n=-1): return self.body.read(n)
    def __init__(self, x): self.body=io.BytesIO(json.dumps(x).encode())

class ProxyTest(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ, {"YC_API_KEY":"AQVN_TEST", "YC_FOLDER_ID":"b1g_test"}, clear=True)
        self.env.start();self.addCleanup(self.env.stop)
        self.sent=[]
        def send(req, timeout):
            self.assertEqual(timeout,60)
            self.sent.append(json.loads(req.data))
            return Response({"result":{"alternatives":[{"message":{"text":"hello"},"status":"ALTERNATIVE_STATUS_FINAL"}]}})
        self.urlopen=patch.object(index.urllib.request,"urlopen",side_effect=send)
        self.urlopen.start();self.addCleanup(self.urlopen.stop)

    def request(self, **x):
        d={"messages":[{"role":"system","content":"S"},{"role":"user","content":"U"}]}
        d.update(x)
        result=index.handler({"httpMethod":"POST","body":json.dumps(d)},None)
        return result["statusCode"], json.loads(result["body"])

    def test_legacy_contract(self):
        status,body=self.request(model="yandexgpt-5", max_tokens=3500)
        self.assertEqual(status,200)
        self.assertEqual(body,{"choices":[{"message":{"content":"hello"}}]})
        self.assertEqual(self.sent[0]["modelUri"],"gpt://b1g_test/yandexgpt-lite/latest")
        self.assertEqual(self.sent[0]["completionOptions"]["maxTokens"],"2000")

    def test_explicit_routing(self):
        os.environ["SOP_ENABLE_MODEL_ROUTING"]="1"
        for model,uri in (("yandexgpt","yandexgpt-5-pro"),("yandexgpt-5","yandexgpt-5.1")):
            self.assertEqual(self.request(model=model)[0],200)
            self.assertEqual(self.sent[-1]["modelUri"],"gpt://b1g_test/"+uri)

    def test_explicit_tokens(self):
        os.environ["SOP_ENABLE_CLIENT_MAX_TOKENS"]="1"
        self.assertEqual(self.request(max_tokens=3500)[0],200)
        self.assertEqual(self.sent[-1]["completionOptions"]["maxTokens"],"3500")

    def test_reject_unknown_model(self):
        os.environ["SOP_ENABLE_MODEL_ROUTING"]="1"
        self.assertEqual(self.request(model="gpt://evil/model")[0],400)
        self.assertEqual(len(self.sent),0)

    def test_bad_json(self):
        r=index.handler({"httpMethod":"POST","body":"{"},None)
        self.assertEqual(r["statusCode"],400)

    def test_no_retry_on_429(self):
        def fail(*args,**kwargs):
            raise urllib.error.HTTPError("http://upstream",429,"Too Many Requests",{},io.BytesIO(b"rate limit"))
        with patch.object(index.urllib.request,"urlopen",side_effect=fail) as mocked:
            self.assertEqual(self.request()[0],429)
            self.assertEqual(mocked.call_count,1)

    def test_options(self):
        self.assertEqual(index.handler({"httpMethod":"OPTIONS"},None)["statusCode"],204)

    def test_truncated_opt_in(self):
        def truncated(*a,**kw):
            return Response({"result":{"alternatives":[{"message":{"text":"partial"},"status":"ALTERNATIVE_STATUS_TRUNCATED_FINAL"}]}})
        with patch.object(index.urllib.request,"urlopen",side_effect=truncated):
            self.assertEqual(self.request()[0],200)
            os.environ["SOP_STRICT_COMPLETION"]="1"
            self.assertEqual(self.request()[0],502)

if __name__=="__main__": unittest.main()
