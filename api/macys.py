import os
import sys
sys.path.append(os.path.dirname(__file__))

import json
import dateutil.parser
import re
import requests

APP_NAME = "ATT Hack"
API_KEY = "atthack2015"

GET_API_HEADERS = {'X-Macys-Webservice-Client-Id': 'atthack2015',
                   'Accept': 'application/json',
                  }
MOD_API_HEADERS = {'X-Macys-Webservice-Client-Id': 'atthack2015',
                   'Accept': 'application/json',
                   'Content-Type': 'application/json'
                  }

API_URL_ROOT = 'http://api.macys.com'

def jget(url, params={}):
    if not url.startswith('http'):
        url = API_URL_ROOT + '/' + url.lstrip('/')
    resp = requests.get(url, headers=GET_API_HEADERS, params=params)
    return resp.status_code, json.loads(resp.content)

def jpost(url, params={}, data={}):
    if not url.startswith('http'):
        url = API_URL_ROOT + '/' + url.lstrip('/')
    resp = requests.post(url, data=json.dumps(data), headers=MOD_API_HEADERS, params=params)
    return resp.status_code, json.loads(resp.content)
    
def jput(url, params={}, data={}):
    if not url.startswith('http'):
        url = API_URL_ROOT + '/' + url.lstrip('/')
    resp = requests.put(url, data=json.dumps(data), headers=MOD_API_HEADERS, params=params)
    return resp.status_code, json.loads(resp.content)

def jdelete(url, params={}):
    if not url.startswith('http'):
        url = API_URL_ROOT + '/' + url.lstrip('/')
    resp = requests.put(url, headers=MOD_API_HEADERS, params=params)
    return resp.status_code, json.loads(resp.content)


