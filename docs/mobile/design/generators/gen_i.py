# Generates Direction I artboards (Dice + Instagram references, one sans family, pure black night).
import os, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
L = {  # logo blobs
 'ore':'/_blob/3b1038091dba05cab76a2985df77d807','msu':'/_blob/520974c5f5e4ad067fe99e344fadcc8c',
 'tex':'/_blob/780d1d30c822acc5313c94fda392ab05','uga':'/_blob/e7960772d63cce8552df77f2891a6abb',
 'lal':'/_blob/0b85c96da03a98c6e532d58a4db68eaf','bos':'/_blob/7fb4ec15b790bf5701a7497d51a9d359',
 'den':'/_blob/1f753e7e399767c0a54b5f5a29e4308c','gsw':'/_blob/0d7898ff816ba66e2f9fa3d5edabdcf0',
 'buf':'/_blob/3406217fa60cff6288d40ff9957289f4','kc':'/_blob/61fa431b78c6eb074c42ead06df7f5c3',
 'dal':'/_blob/451101d5323d6c0f077d92e2b5d7872b','phi':'/_blob/63b18bd057d615b0821312c049eddca7'}
NIGHT = dict(bg='#000000', surf='#161618', surf2='#232326', line='#1C1C1F', tx='#F5F5F7', t2='#A1A1A6', t3='#6E6E73',
             tab='rgba(28, 28, 30, 0.92)', tabBorder='#2A2A2D', tabOn='#2C2C2E', shadow='0 14px 34px rgba(0, 0, 0, 0.6)', mark='#161618',
             accents=['#2FE38A', '#22C373', '#00D97E'])
DAY = dict(bg='#FFFFFF', surf='#F2F2F4', surf2='#ECECEF', line='#EDEDF0', tx='#0A0A0B', t2='#6B6B70', t3='#9A9AA0',
           tab='rgba(255, 255, 255, 0.94)', tabBorder='#E6E6E9', tabOn='#F0F0F2', shadow='0 14px 34px rgba(10, 10, 11, 0.12)', mark='#0A0A0B',
           accents=['#0E8A4F', '#0B7A44', '#128C5A'])
PTS = '4,16 9,16 12.5,9 16.5,23 20,13 23,16 28,16'

def head(title):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Instrument+Sans:wdth,wght@75..100,400..700&display=swap">
<style>
body{{margin:0}}
a{{color:inherit}}
.beat .b{{stroke-dasharray:48 48;animation:mgpBeat 2.4s cubic-bezier(.4,0,.2,1) infinite}}
@keyframes mgpBeat{{0%{{stroke-dashoffset:48}}40%{{stroke-dashoffset:0}}65%{{stroke-dashoffset:0}}100%{{stroke-dashoffset:-48}}}}
@media (prefers-reduced-motion: reduce){{.beat .b{{animation:none;stroke-dasharray:none}}}}
</style>
</helmet>
'''

def tail(accents):
    props = '{"font":{"editor":"enum","options":["Geist","Instrument Sans","SF Pro (iPhone)"],"default":"Geist","section":"Look"},"accent":{"editor":"color","options":["%s","%s","%s"],"default":"%s","section":"Look"},"$preview":{"width":390,"height":844}}' % (accents[0], accents[1], accents[2], accents[0])
    return f'''</x-dc>
<script type="text/x-dc" data-dc-script data-props='{props}'>
class Component extends DCLogic {{
  renderVals() {{
    const fonts = {{
      'Geist': "'Geist', system-ui, sans-serif",
      'Instrument Sans': "'Instrument Sans', system-ui, sans-serif",
      'SF Pro (iPhone)': "-apple-system, 'SF Pro Text', system-ui, sans-serif"
    }};
    return {{ ff: fonts[this.props.font ?? 'Geist'] ?? fonts['Geist'], accent: this.props.accent ?? '{accents[0]}' }};
  }}
}}
</script>
</body>
</html>
'''

def beat(size=17):
    return f'<svg class="beat" width="{size}" height="{size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="{PTS}" opacity=".3"/><polyline class="b" points="{PTS}"/></svg>'

def mark(c, size=26):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 32 32" role="img" aria-label="MGP"><rect width="32" height="32" rx="8" fill="{c["mark"]}"/><polyline points="6,16 10,16 13,10 16,22 19,14 22,16 26,16" fill="none" stroke="{{{{accent}}}}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

ICON = {
 'search': '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
 'share': '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
 'back': '<path d="M15 18l-6-6 6-6"/>',
 'today': '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
 'games': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>',
 'insiders': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M21.5 20c0-3-2-5.2-4.5-5.8"/>',
 'analyst': '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
 'arrow': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
}
def icon(name, size=21, stroke='currentColor', sw=1.7, fill='none'):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>'

def tabbar(c, active, todayHref='#t', gamesHref='#t'):
    items = [('Today','today',todayHref),('Games','games',gamesHref),('Alerts','bell','#t'),('Insiders','insiders','#t'),('The Analyst','analyst','#t')]
    out = []
    for label, ic, href in items:
        if label == active:
            out.append(f'<a href="{href}" style="height: 52px; border-radius: 999px; background: {c["tabOn"]}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: {c["tx"]}; text-decoration: none; font-size: 10.5px; font-weight: 600">{icon(ic, stroke="{{accent}}", sw=1.9)}{label}</a>')
        else:
            out.append(f'<a href="{href}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; color: {c["t2"]}; text-decoration: none; font-size: 10.5px; font-weight: 500">{icon(ic)}{label}</a>')
    return f'''  <nav aria-label="Tabs" style="position: absolute; left: 14px; right: 14px; bottom: 22px; height: 64px; border-radius: 999px; background: {c["tab"]}; border: 1px solid {c["tabBorder"]}; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; padding: 0 6px; box-shadow: {c["shadow"]}">
    {chr(10).join("    " + o for o in out).strip()}
  </nav>
'''

def pair(c, away, home, size=48, d=34):
    off = size - d
    def circ(k, x, y, z):
        return f'<span style="position: absolute; left: {x}px; top: {y}px; z-index: {z}; width: {d}px; height: {d}px; box-sizing: border-box; border-radius: 999px; background: {c["surf"]}; border: 2.5px solid {c["bg"]}; display: flex; align-items: center; justify-content: center"><img src="{L[k]}" alt="" width="{int(d*0.62)}" height="{int(d*0.62)}" style="width: {int(d*0.62)}px; height: {int(d*0.62)}px; object-fit: contain"></span>'
    return f'<span aria-hidden="true" style="position: relative; flex: 0 0 auto; width: {size}px; height: {size}px">{circ(away,0,0,1)}{circ(home,off,off,2)}</span>'

def matchup(c, away, home, rank=None):
    r = f'<span style="color: {c["t2"]}; font-weight: 400">#{rank} </span>' if rank else ''
    return f'{away} at {r}{home}'

def section(c, text, top=22):
    return f'  <h2 style="margin: 0; padding: {top}px 16px 6px; font-size: 22px; font-weight: 500; letter-spacing: -0.3px">{text}</h2>\n'

def today_row(c, g, href):
    w = 600 if g.get('new') else 400
    status = f'<span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; color: {{{{accent}}}}">{beat(18)}Line Moved</span>' if g.get('moved') else ''
    return f'''  <a href="{href}" style="display: flex; align-items: center; gap: 12px; padding: 9px 16px; text-decoration: none; color: {c["tx"]}">
    {pair(c, g["a"], g["h"])}
    <span style="flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px">
      <span style="font-size: 16.5px; letter-spacing: -0.2px; font-weight: {w}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{matchup(c, g["an"], g["hn"], g.get("rank"))}</span>
      <span style="display: flex; align-items: center; font-size: 14.5px; color: {c["t2"]}; white-space: nowrap">{g["time"]}{status}</span>
    </span>
    <span style="flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; font-variant-numeric: tabular-nums">
      <span style="font-size: 16px; font-weight: 500">{g["line"]}</span>
      <span style="font-size: 13px; color: {c["t3"]}">{g["total"]}</span>
    </span>
  </a>
'''

def games_row(c, g, href):
    line = (f'<span style="display: inline-flex; align-items: center; gap: 4px; color: {{{{accent}}}}">{beat(18)}{g["line"]}</span>' if g.get('moved')
            else f'<span>{g["line"]}</span>')
    if g.get('follow'):
        bell = f'<button aria-label="Alerts on for this game" style="flex: 0 0 auto; width: 44px; height: 44px; border: 0; background: none; color: {{{{accent}}}}; display: flex; align-items: center; justify-content: center; padding: 0">{icon("bell", 24, fill="currentColor", sw=1.6)}</button>'
    else:
        bell = f'<button aria-label="Get alerts for this game" style="flex: 0 0 auto; width: 44px; height: 44px; border: 0; background: none; color: {c["tx"]}; display: flex; align-items: center; justify-content: center; padding: 0">{icon("bell", 24, sw=1.6)}</button>'
    return f'''  <div style="display: flex; align-items: center; gap: 14px; padding: 9px 8px 9px 16px">
    <a href="{href}" style="flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 12px; text-decoration: none; color: {c["tx"]}">
      {pair(c, g["a"], g["h"])}
      <span style="flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px">
        <span style="font-size: 16.5px; letter-spacing: -0.2px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{matchup(c, g["an"], g["hn"], g.get("rank"))}</span>
        <span style="display: flex; align-items: center; gap: 6px; font-size: 14.5px; color: {c["t2"]}; white-space: nowrap; font-variant-numeric: tabular-nums">{g["time"]} ·{line}</span>
      </span>
    </a>
    {bell}
  </div>
'''

def note(c, k, label, bubble, unseen):
    ring = '{{accent}}' if unseen else c['surf2']
    return f'''    <a href="#m" style="position: relative; flex: 0 0 auto; width: 100px; height: 146px; display: flex; flex-direction: column; align-items: center; text-decoration: none; color: {c["tx"]}">
      <span style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 2; padding: 7px 10px; border-radius: 14px; background: {c["surf2"]}; font-size: 12.5px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums">{bubble}<span aria-hidden="true" style="position: absolute; left: 14px; bottom: -5px; width: 8px; height: 8px; border-radius: 999px; background: {c["surf2"]}"></span></span>
      <span style="margin-top: 26px; width: 74px; height: 74px; box-sizing: border-box; border-radius: 999px; border: 2.5px solid {ring}; padding: 3px; display: flex">
        <span style="flex: 1 1 auto; border-radius: 999px; background: {c["surf"]}; display: flex; align-items: center; justify-content: center"><img src="{L[k]}" alt="" width="38" height="38" style="width: 38px; height: 38px; object-fit: contain"></span>
      </span>
      <span style="margin-top: 7px; font-size: 13.5px; color: {c["t2"] if not unseen else c["tx"]}; font-weight: {600 if unseen else 400}">{label}</span>
    </a>
'''

def frame_open(c):
    return f'<div style="position: relative; width: 390px; height: 844px; box-sizing: border-box; background: {c["bg"]}; color: {c["tx"]}; font-family: {{{{ff}}}}; display: flex; flex-direction: column; overflow: hidden">\n'

def topbar(c):
    return f'''  <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 0 16px">
    {mark(c)}
    <div style="display: flex; align-items: center; gap: 4px">
      <button aria-label="Search" style="width: 44px; height: 44px; border: 0; background: none; color: {c["tx"]}; display: flex; align-items: center; justify-content: center; padding: 0">{icon("search")}</button>
      <button aria-label="Profile" style="width: 34px; height: 34px; border-radius: 999px; border: 0; background: {c["surf2"]}; color: {c["tx"]}; font-family: inherit; font-size: 12px; font-weight: 600">JV</button>
    </div>
  </div>
'''

def title(c, t, sub):
    return f'''  <div style="padding: 10px 16px 0; display: flex; flex-direction: column; gap: 6px">
    <h1 style="margin: 0; font-size: 34px; font-weight: 500; letter-spacing: -0.8px; line-height: 1.05">{t}</h1>
    <span style="font-size: 15px; color: {c["t2"]}">{sub}</span>
  </div>
'''

G = {
 'ore': dict(a='msu', h='ore', an='Michigan St', hn='Oregon', rank=12, time='7:30 PM · FOX', line='ORE −6.5', total='O/U 52.5', moved=True, new=True, follow=True),
 'uga': dict(a='tex', h='uga', an='Texas', hn='Georgia', rank=3, time='8:00 PM · ABC', line='UGA −3.5', total='O/U 48.5'),
 'bos': dict(a='lal', h='bos', an='Lakers', hn='Celtics', time='7:30 PM · ESPN', line='BOS −5.5', total='O/U 228.5', moved=True, new=True),
 'den': dict(a='gsw', h='den', an='Warriors', hn='Nuggets', time='10:00 PM · TNT', line='DEN −3', total='O/U 231.5'),
 'kc':  dict(a='buf', h='kc', an='Bills', hn='Chiefs', time='4:25 PM · CBS', line='KC −3.5', total='O/U 47.5', moved=True, follow=True),
 'phi': dict(a='dal', h='phi', an='Cowboys', hn='Eagles', time='8:20 PM · NBC', line='PHI −1.5', total='O/U 44.5'),
}

def today(c, name, title_text):
    s = head(title_text) + frame_open(c) + topbar(c)
    s += title(c, 'Today', 'Saturday, November 21 · 12 games in your sports')
    s += f'''  <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 22px 16px 10px">
    <span style="font-size: 17px; font-weight: 600">Biggest Moves</span>
    <a href="#m" style="font-size: 15px; color: {c["t2"]}; text-decoration: none">See All</a>
  </div>
  <div style="display: flex; gap: 4px; padding: 0 8px; overflow: hidden">
'''
    s += note(c, 'ore', 'Oregon', '−4.5 → −6.5', True)
    s += note(c, 'bos', 'Celtics', '−4 → −5.5', True)
    s += note(c, 'kc', 'Chiefs', '−2.5 → −3.5', False)
    s += note(c, 'phi', 'Eagles', '−3 → −1.5', False)
    s += '  </div>\n'
    s += section(c, 'College Football', 14)
    s += today_row(c, G['ore'], 'IGameNight.dc.html') + today_row(c, G['uga'], 'IGameNight.dc.html')
    s += section(c, 'NBA', 16)
    s += today_row(c, G['bos'], 'IGameNight.dc.html') + today_row(c, G['den'], 'IGameNight.dc.html')
    s += tabbar(c, 'Today', gamesHref='IGames.dc.html') + '</div>\n' + tail(c['accents'])
    open(os.path.join(OUT, name), 'w').write(s)

def games(c, name):
    s = head('Direction I, Games') + frame_open(c) + topbar(c)
    s += title(c, 'Games', 'Every game in your sports for the next 7 days')
    chips = [('Sat 21', True), ('Sun 22', False), ('Mon 23', False), ('Tue 24', False), ('Wed 25', False)]
    s += '  <div style="display: flex; gap: 4px; padding: 18px 12px 0; white-space: nowrap; overflow: hidden">\n'
    for t, on in chips:
        st = f'background: {c["surf2"]}; color: {c["tx"]}' if on else f'color: {c["t2"]}'
        s += f'    <a href="#d" style="flex: 0 0 auto; padding: 10px 18px; border-radius: 999px; font-size: 16px; text-decoration: none; {st}">{t}</a>\n'
    s += '  </div>\n'
    s += section(c, 'Saturday, November 21', 20)
    for k in ['ore', 'bos', 'uga', 'den']:
        s += games_row(c, G[k], 'IGameNight.dc.html')
    s += section(c, 'Sunday, November 22', 18)
    for k in ['kc', 'phi']:
        s += games_row(c, G[k], 'IGameNight.dc.html')
    s += tabbar(c, 'Games', todayHref='ITodayNight.dc.html') + '</div>\n' + tail(c['accents'])
    open(os.path.join(OUT, name), 'w').write(s)

def game(c, name):
    circle = f'width: 44px; height: 44px; border-radius: 999px; border: 0; background: {c["surf"]}; display: flex; align-items: center; justify-content: center; padding: 0; text-decoration: none'
    s = head('Direction I, Game Page') + frame_open(c)
    s += f'''  <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 0">
    <a href="ITodayNight.dc.html" aria-label="Back" style="{circle}; color: {c["tx"]}">{icon("back", 22)}</a>
    <div style="display: flex; gap: 10px">
      <button aria-label="Alerts on for this game" style="{circle}; color: {{{{accent}}}}">{icon("bell", 21, fill="currentColor", sw=1.6)}</button>
      <button aria-label="Share" style="{circle}; color: {c["tx"]}">{icon("share", 20)}</button>
    </div>
  </div>
  <div style="padding: 18px 16px 0; display: flex; flex-direction: column; gap: 10px">
'''
    for k, nm, rec, rank in [('msu', 'Michigan State', '7-4', None), ('ore', 'Oregon', '9-2', 12)]:
        r = f'<span style="color: {c["t2"]}; font-size: 20px; margin-right: 6px">#{rank}</span>' if rank else ''
        s += f'''    <div style="display: flex; align-items: center; gap: 12px">
      <span style="width: 40px; height: 40px; border-radius: 999px; background: {c["surf"]}; display: flex; align-items: center; justify-content: center"><img src="{L[k]}" alt="" width="26" height="26" style="width: 26px; height: 26px; object-fit: contain"></span>
      <span style="flex: 1 1 auto; font-size: 28px; font-weight: 500; letter-spacing: -0.6px">{r}{nm}</span>
      <span style="font-size: 15px; color: {c["t3"]}; font-variant-numeric: tabular-nums">{rec}</span>
    </div>
'''
    s += f'''    <span style="font-size: 15px; color: {c["t2"]}">Saturday 7:30 PM · FOX · Autzen Stadium</span>
    <span style="display: flex; align-items: center; gap: 6px; font-size: 15px; color: {{{{accent}}}}; font-variant-numeric: tabular-nums">{beat(18)}Line moved −4.5 → −6.5 since open</span>
  </div>
  <div style="display: flex; gap: 4px; padding: 16px 12px 4px; white-space: nowrap; overflow: hidden">
'''
    for t, on in [('What to Know', True), ('Odds', False), ('Injuries', False), ('Form', False), ('Splits', False)]:
        st = f'background: {c["surf2"]}; color: {c["tx"]}' if on else f'color: {c["t2"]}'
        s += f'    <a href="#s" style="flex: 0 0 auto; padding: 9px 15px; border-radius: 999px; font-size: 15px; text-decoration: none; {st}">{t}</a>\n'
    s += '  </div>\n'
    cols = 'display: grid; grid-template-columns: 1fr 96px 72px 56px; align-items: baseline; font-variant-numeric: tabular-nums'
    s += f'''  <div style="padding: 10px 16px 0">
    <div style="{cols}; font-size: 13px; color: {c["t3"]}; padding-bottom: 8px"><span></span><span style="text-align: right">Spread</span><span style="text-align: right">Total</span><span style="text-align: right">ML</span></div>
    <div style="{cols}; padding: 10px 0; border-top: 1px solid {c["line"]}; font-size: 17px"><span style="font-weight: 500">MSU</span><span style="text-align: right">+6.5 <span style="font-size: 13px; color: {c["t2"]}">(−110)</span></span><span style="text-align: right">O 52.5</span><span style="text-align: right">+200</span></div>
    <div style="{cols}; padding: 10px 0; border-top: 1px solid {c["line"]}; border-bottom: 1px solid {c["line"]}; font-size: 17px"><span style="font-weight: 500">ORE</span><span style="text-align: right">−6.5 <span style="font-size: 13px; color: {c["t2"]}">(−110)</span></span><span style="text-align: right">U 52.5</span><span style="text-align: right">−245</span></div>
    <div style="padding-top: 8px; font-size: 13px; color: {c["t3"]}">DraftKings · Updated 2:10 PM</div>
  </div>
'''
    s += section(c, 'What to Know', 18)
    for txt, tag in [('Oregon has won 4 straight', 'Form'), ('Oregon moved −4.5 → −6.5 since open', 'Odds'), ("Oregon's starting QB is questionable", 'Injuries')]:
        s += f'''  <a href="#s" style="display: flex; align-items: center; gap: 12px; margin: 0 16px; padding: 11px 0; border-bottom: 1px solid {c["line"]}; text-decoration: none; color: {c["tx"]}">{icon("arrow", 17, stroke="{{accent}}", sw=2.2)}<span style="flex: 1 1 auto; font-size: 16px">{txt}</span><span style="font-size: 13px; color: {c["t3"]}">{tag}</span></a>
'''
    s += f'''  <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 20px 16px 0">
    <span style="font-size: 22px; font-weight: 500; letter-spacing: -0.3px">Signal</span>
    <span style="display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600"><span style="width: 8px; height: 8px; border-radius: 999px; background: {{{{accent}}}}"></span>Leans Oregon</span>
  </div>
'''
    s += tabbar(c, 'Today', todayHref='ITodayNight.dc.html', gamesHref='IGames.dc.html') + '</div>\n' + tail(c['accents'])
    open(os.path.join(OUT, name), 'w').write(s)

if __name__ == '__main__':
  today(NIGHT, 'ITodayNight.dc.html', 'Direction I, Today, Night')
  games(NIGHT, 'IGames.dc.html')
  game(NIGHT, 'IGameNight.dc.html')
  today(DAY, 'ITodayDay.dc.html', 'Direction I, Today, Day')
  print('written')
