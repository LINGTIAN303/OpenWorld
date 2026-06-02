from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random, os
W,H=1024,1792
img=Image.new('RGB',(W,H),(10,14,36))
d=ImageDraw.Draw(img)
for y in range(H):
    r=int(10*(1-y/1792)+5*(y/1792));g=int(14*(1-y/1792)+5*(y/1792));b=int(36*(1-y/1792)+12*(y/1792))
    d.line([(0,y),(W,y)],fill=(r,g,b))
random.seed(42)
for _ in range(600):
    x=random.randint(0,W-1);y=random.randint(0,int(H*0.5));s=random.choice([1,1,1,2,2,3]);br=random.randint(100,255)
    d.ellipse([x,y,x+s,y+s],fill=(br,br,min(255,br+15)))
print("Part1 OK")
