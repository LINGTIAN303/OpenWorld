import requests, json, base64, os
resp = requests.post('https://sui-xiang.com/v1/images/generations',
    headers={'Authorization': 'Bearer e706d27817eb7af6','Content-Type':'application/json'},
    json={'model':'gpt-image-2',
        'prompt':'Cinematic movie poster, vertical portrait, ultra-detailed. Futuristic sci-fi landscape with Eastern aesthetics. Majestic mountains in clouds, glowing river like liquid light. Deep space and stars. Color: deep navy, black, silver-white, cold neon cyan. Minimalist. Far distant floating spacecraft and city skyline through mist. Cinematic volumetric fog. At bottom center text SHANHAI FLEET in Chinese minimalist futuristic font silver glow. Movie poster.',
        'n':1,'size':'1024x1792','quality':'standard','style':'vivid'},
    timeout=120)
data = resp.json()
print(f'Status: {resp.status_code}')
if resp.status_code==200 and 'data' in data:
    img_data = data['data'][0]['b64_json'] if 'b64_json' in data['data'][0] else requests.get(data['data'][0]['url']).content
    save_path = r'D:\本地化AI\DeepSeek_Home\worldsmith\worldsmith-server\images\shanhai-fleet-poster.png'
    with open(save_path,'wb') as f:
        if isinstance(img_data,str): f.write(base64.b64decode(img_data))
        else: f.write(img_data)
    print(f'OK: {save_path}')
else: print(f'Error: {json.dumps(data,indent=2,ensure_ascii=False)[:800]}')
