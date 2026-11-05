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
    if not (root / 'sounds' / original).exists():
        print('Optional Mixkit source missing; existing asset preserved:', original)
        continue
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

for original, target in [('basketball_backboard.wav','board.wav'), ('basketball_netsound.wav','net.wav')]:
    source = root / 'sounds' / original
    if source.exists():
        shutil.copyfile(source, out / target)
    elif not (out / target).exists():
        raise FileNotFoundError('Missing licensed source: ' + str(source))

for group,count in [('bounce',5),('rim',5),('swish',7)]:
    for number in range(1,count+1):
        name = '%s_%02d.WAV' % (group,number)
        source = root / 'sounds' / group / name
        if not source.exists():
            source = root / 'sounds' / name
        target = out / name.lower()
        if source.exists():
            shutil.copyfile(source,target)
        elif not target.exists():
            raise FileNotFoundError('Missing audio variation: ' + str(source))

# Original procedural placeholders, NOT recordings of basketball equipment/shoes.
specs={'jump':(.13,0,18,1),'land':(.15,75,25,.35),
       'block-jump':(.16,0,16,1),'block-hit':(.12,130,25,.6)}
for seed,(name,(seconds,freq,decay,noise)) in enumerate(specs.items()):
    if (out / (name+'.wav')).exists():
        continue
    rng=random.Random(seed);samples=[];filtered=0
    for i in range(int(seconds*rate)):
        t=i/rate;filtered=.72*filtered+.28*rng.uniform(-1,1)
        tone=math.sin(2*math.pi*freq*t)+(.3*math.sin(2*math.pi*freq*2.71*t) if name=='rim' else 0)
        attack=min(1,t/.003)
        samples.append(attack*math.exp(-decay*t)*((1-noise)*tone+noise*filtered))
    for i in range(int(rate*.006)):samples[-1-i]*=i/(rate*.006)
    save(name+'.wav',samples)
print('Prepared bounce x5, rim x5, swish x7; backboard and other existing assets preserved.')
