"""Prepare local game assets; no downloads. Mixkit files stay out of source distribution."""
from pathlib import Path
import array, math, random, shutil, wave

root = Path(__file__).resolve().parent.parent
out = root / 'apps/web/public/assets/audio'
out.mkdir(parents=True, exist_ok=True)
rate = 44100

def save(name, samples):
    peak = max(max(map(abs, samples)), .001)
    pcm = array.array('h', (int(max(-1, min(1, x / peak * .8)) * 32767) for x in samples))
    with wave.open(str(out / name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm.tobytes())

for original, target in [('basketball-ball-drible-2093.wav','dribble.wav'), ('basketball-ball-bouncing.wav','bounce.wav')]:
    with wave.open(str(root / 'sounds' / original), 'rb') as w:
        assert w.getsampwidth() == 3 and w.getframerate() == rate
        channels=w.getnchannels(); raw=w.readframes(w.getnframes())
        values=[int.from_bytes(raw[i:i+3], 'little', signed=True)/8388608 for i in range(0,len(raw),3)]
        samples=[sum(values[i:i+channels])/channels for i in range(0,len(values),channels)]
    threshold=max(map(abs,samples))*.025
    start=next((i for i,x in enumerate(samples) if abs(x)>threshold),0)
    samples=samples[max(0,start-int(rate*.002)):]
    for i in range(min(int(rate*.005),len(samples))): samples[-1-i]*=i/(rate*.005)
    save(target,samples)

shutil.copyfile(root / 'sounds/freesound_community-basketball-backboard-83558.mp3',out / 'board.mp3')

# Original procedural placeholders, NOT recordings of basketball equipment/shoes.
specs={'step':(.10,90,32,.3),'rim':(.30,620,13,.14),
       'net':(.23,0,10,1),'jump':(.13,0,18,1),'land':(.15,75,25,.35),
       'block-jump':(.16,0,16,1),'block-hit':(.12,130,25,.6)}
for seed,(name,(seconds,freq,decay,noise)) in enumerate(specs.items()):
    rng=random.Random(seed);samples=[];filtered=0
    for i in range(int(seconds*rate)):
        t=i/rate;filtered=.72*filtered+.28*rng.uniform(-1,1)
        tone=math.sin(2*math.pi*freq*t)+(.3*math.sin(2*math.pi*freq*2.71*t) if name=='rim' else 0)
        attack=min(1,t/.003)
        samples.append(attack*math.exp(-decay*t)*((1-noise)*tone+noise*filtered))
    for i in range(int(rate*.006)):samples[-1-i]*=i/(rate*.006)
    save(name+'.wav',samples)
print('Prepared 2 Mixkit-derived WAVs, 1 user-supplied Pixabay MP3 and 7 synthetic WAVs.')
