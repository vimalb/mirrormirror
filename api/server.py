import os
import sys
sys.path.append(os.path.dirname(__file__))

import json
import dateutil.parser
import re

from flask import Flask, request, send_from_directory, safe_join, Response
from flask.ext.cors import CORS
app = Flask(__name__)
CORS(app)

RECORDINGS_PATH = '/recordings'
WWW_RECORDINGS_ROOT = os.environ['WWW_SERVER_URL'] + RECORDINGS_PATH
FS_RECORDINGS_ROOT = os.path.join(os.path.dirname(__file__), '../www'+RECORDINGS_PATH)

def dump(filename, content):
    dirname = os.path.dirname(filename)
    if not os.path.exists(dirname):
        os.makedirs(dirname)
    with open(filename, 'w') as w:
        w.write(content)

def load(filename):
    with open(filename, 'r') as r:
        return r.read()
        
def jdump(jval, filename):
    jdir = os.path.dirname(filename)
    if jdir and not os.path.exists(jdir):
        os.makedirs(jdir)
    with open(filename, 'w') as w:
        json.dump(jval, w, indent=2)

def jload(filename):
    with open(filename, 'r') as r:
        return json.load(r)        



@app.route("/api/test")
def sample():
    resp = {"Testing": "Hello world!"}
    return Response(json.dumps(resp), mimetype='application/json')

@app.route("/api/test/echo/<arg>", methods=['GET', 'PUT', 'DELETE', 'POST'])
def sample_echo(arg):
    if request.method in ['POST','PUT']:
        req = json.loads(request.get_data())
    else:
        req = {}
    resp = {"Testing Arg": arg,
            "Testing Method": request.method,
            "Testing Data": req}
    return Response(json.dumps(resp), mimetype='application/json')

# $.postJSON('http://192.168.1.129:5000/api/recordings', {}, function(resp){ console.log(resp)})
def _clean_recording(recording_json):
    recording_id = recording_json['recordingId']
    info_filename = os.path.join(FS_RECORDINGS_ROOT, recording_id+'.info.json')
    for k,v in list(recording_json.get('thumbnails',{}).iteritems()):
        if v.startswith('data:image/png'):
            header, img_data = v.split(',')
            img_prefix, img_ext, img_enc = re.split('/|;|,',header)[:3]
            img_filename = recording_id+'.thumbnail.'+k+'.'+img_ext
            dump(os.path.join(FS_RECORDINGS_ROOT, img_filename), img_data.decode(img_enc))
            img_url = WWW_RECORDINGS_ROOT+'/'+img_filename
        else:
            img_url = v
        img_filename = recording_id+'.thumbnail.'+k+'.'+img_url.split('.')[-1]
        img_url = WWW_RECORDINGS_ROOT+'/'+img_filename
        recording_json['thumbnails'][k] = img_url
    if recording_json.get('state') == 'finished':
        recording_json['video_url'] = WWW_RECORDINGS_ROOT+'/'+recording_id+'.webm'
    jdump(recording_json, info_filename)
    print "Cleaned recording", info_filename
    return recording_json
    
@app.route("/api/recordings", methods=['GET', 'POST'])
def recordings_collection():
    resp = [jload(os.path.join(FS_RECORDINGS_ROOT, l)) for l in os.listdir(FS_RECORDINGS_ROOT) if l.endswith('.info.json')]
    if request.method in ['POST']:
        for recording_json in resp:
            _clean_recording(recording_json)
    return Response(json.dumps(resp), mimetype='application/json')
    
@app.route("/api/recordings/<recording_id>", methods=['GET','POST','PUT'])
def recordings_item(recording_id):
    info_filename = os.path.join(FS_RECORDINGS_ROOT, recording_id+'.info.json')
    if request.method in ['POST','PUT']:
        recording_json = json.loads(request.get_data())
        _clean_recording(recording_json)
        recording_json['recordingId'] = recording_id
        jdump(recording_json, info_filename)
    if os.path.exists(info_filename):
        recording_json = jload(info_filename)
        return Response(json.dumps(recording_json), mimetype='application/json')
    else:
        resp = {}
        return Response(json.dumps(resp), status='404')
        

    
if __name__ == "__main__":
    app.run('0.0.0.0', 3000, debug=True)
