from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random, os
W,H=1024,1792
img=Image.new('RGB',(W,H),(10,14,36))
d=ImageDraw.Draw(img)

# 1. Gradient background
for y in range(H):
    r=int(10*(1-y/1792)+5*(y/1792));g=int(14*(1-y/1792)+5*(y/1792));b=int(36*(1-y/1792)+12*(y/1792))
    d.line([(0,y),(W,y)],fill=(r,g,b))

# 2. Stars
random.seed(42)
for _ in range(600):
    x=random.randint(0,W-1);y=random.randint(0,int(H*0.5));s=random.choice([1,1,1,2,2,3])
    br=random.randint(100,255);d.ellipse([x,y,x+s,y+s],fill=(br,br,min(255,br+15)))

# 3. Clouds
random.seed(99)
for _ in range(20):
    cx=random.randint(-100,1124);cy=int(H*0.5)+random.randint(0,60);w=random.randint(180,400);h=random.randint(10,30)
    for j in range(h,0,-1):
        a=int(20*(1-j/h));clr=tuple(max(0,v-a) for v in (70,100,160))
        d.ellipse([cx-w//2,cy-j//2,cx+w//2,cy+j//2],fill=clr)

# 4. Mountains
def gm(by,n,hr):
    pts=[(0,H)];x=0
    for i in range(n):
        x+=random.randint(50,140);y=by-random.randint(hr[0],hr[1])
        pts.append((x,y))
    pts.append((W,H));return pts

for clr,by,n,hr in[((15,20,40),int(H*0.55),12,(40,150)),((25,35,60),int(H*0.62),10,(80,250)),((20,28,50),int(H*0.70),8,(120,380))]:
    d.polygon(gm(by,n,hr),fill=clr)

# 5. Glowing river
def bz(t,pts):
    n=len(pts)-1
    return(sum(math.comb(n,i)*(t**i)*((1-t)**(n-i))*px for i,(px,py) in enumerate(pts)),
           sum(math.comb(n,i)*(t**i)*((1-t)**(n-i))*py for i,(px,py) in enumerate(pts)))

rc=[(W*0.32,H*0.72),(W*0.36,H*0.78),(W*0.42,H*0.84),(W*0.38,H*0.90),(W*0.44,H*0.95)]
rco=[bz(i/99,rc) for i in range(100)]

for w in[12,8,4]:
    for x,y in rco:
        d.ellipse([x-w,y-w,x+w,y+w],fill=(30,140+w*8,200+w*5))
for x,y in rco:
    d.ellipse([x-2,y-2,x+2,y+2],fill=(80,220,255));d.ellipse([x-1,y-1,x+1,y+1],fill=(240,242,255))

# 6. Fleet
random.seed(123)
for _ in range(6):
    fx=random.randint(120,904);fy=int(H*0.36)+random.randint(-20,20);s=random.uniform(0.4,1.0)
    d.polygon([(fx-30*s,fy+6*s),(fx-20*s,fy-4*s),(fx+20*s,fy-4*s),(fx+30*s,fy+6*s)],fill=(90,130,190))
    d.line([(fx-20*s,fy),(fx+20*s,fy)],fill=(80,220,255,50),width=2)
    for _ in range(3):
        ox=fx+random.randint(-40,40)*s;oy=fy-random.randint(8,25)*s
        d.ellipse([ox-3*s,oy-1.5*s,ox+3*s,oy+1.5*s],fill=(130,170,210))

# 7. City silhouette
city_y=int(H*0.40);random.seed(777);x=30
while x<994:
    bw=random.randint(10,30);bh=random.randint(15,70)
    d.rectangle([x,city_y-bh,x+bw,city_y],fill=(12,18,35))
    for wy in range(city_y-bh+4,city_y-4,7):
        for wx in range(x+2,x+bw-2,5):
            if random.random()<0.3:d.rectangle([wx,wy,wx+1,wy+1],fill=(80,220,255,15))
    x+=bw+random.randint(2,6)

# 8. God rays
for _ in range(15):
    x0,y0=W-80,30;ang=random.uniform(0.3,0.55);l=random.randint(200,500)
    x1=int(x0-l*math.cos(ang));y1=int(y0+l*math.sin(ang))
    d.line([(x0,y0),(x1,y1)],fill=(80,160,255,random.randint(3,8)),width=random.randint(1,3))

# 9. Text
try:font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',56);fs=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
except:font=ImageFont.load_default();fs=ImageFont.load_default()

txt='\u5c71\u6d77\u8230\u961f';bb=d.textbbox((0,0),txt,font=font);tw=bb[2]-bb[0];tx=(W-tw)//2;ty=H-200
for gs in[6,4,2]:
    for dx in range(-gs,gs+1):
        for dy in range(-gs,gs+1):
            if abs(dx)+abs(dy)<=gs:a=max(0,50-(abs(dx)+abs(dy))*7);d.text((tx+dx,ty+dy),txt,fill=(60,180,255,a),font=font)
d.text((tx,ty),txt,fill=(200,210,230),font=font)
ly=ty+bb[3]-bb[1]+20;d.line([(tx-20,ly),(tx+tw+20,ly)],fill=(80,220,255),width=2)
sub='SHANHAI FLEET';sb=d.textbbox((0,0),sub,font=fs);sw=sb[2]-sb[0]
d.text(((W-sw)//2,ly+12),sub,fill=(100,140,180),font=fs)

# 10. Blur
img=img.filter(ImageFilter.GaussianBlur(radius=0.5))

# Save
od=r'D:\本地化AI\DeepSeek_Home\worldsmith\worldsmith-server\images'
os.makedirs(od,exist_ok=True);op=os.path.join(od,'shanhai-fleet-poster.png')
img.save(op,quality=95)
print(f'Done: {op}')
print(f'Size: {img.size[0]}x{img.size[1]}')
