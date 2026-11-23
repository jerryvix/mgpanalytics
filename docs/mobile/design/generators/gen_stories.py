# Story mockups: what opens when you tap a circle in the Today story row (Direction I).
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from gen_i import NIGHT as C, L, PTS, ICON, icon, beat, mark, pair, tail, frame_open, topbar, title, section, today_row, tabbar, G
OUT = sys.argv[1]
ICON['close'] = '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'
ICON['up'] = '<path d="M6 15l6-6 6 6"/>'
ICON['score'] = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10v4"/><path d="M16 10v4"/><path d="M12 9v.01"/><path d="M12 15v.01"/>'

def head(t, serif=False):
    fam = 'family=Geist:wght@400..700&family=Instrument+Sans:wdth,wght@75..100,400..700' + ('&family=Instrument+Serif:ital@0;1' if serif else '')
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{t}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fam}&display=swap">
<style>
body{{margin:0}}
a{{color:inherit}}
.beat .b{{stroke-dasharray:48 48;animation:mgpBeat 2.4s cubic-bezier(.4,0,.2,1) infinite}}
@keyframes mgpBeat{{0%{{stroke-dashoffset:48}}40%{{stroke-dashoffset:0}}65%{{stroke-dashoffset:0}}100%{{stroke-dashoffset:-48}}}}
.ping{{transform-box:fill-box;transform-origin:center;animation:mgpPing 2s ease-out infinite}}
@keyframes mgpPing{{0%{{transform:scale(1);opacity:.6}}100%{{transform:scale(3.2);opacity:0}}}}
@media (prefers-reduced-motion: reduce){{.beat .b{{animation:none;stroke-dasharray:none}}.ping{{animation:none;opacity:0}}}}
</style>
</helmet>
'''

def segs(fills):
    bars = ''.join(f'<span style="flex: 1 1 0; height: 2.5px; border-radius: 2px; background: rgba(255, 255, 255, 0.22); overflow: hidden"><span style="display: block; width: {f}%; height: 100%; background: #FFFFFF"></span></span>' for f in fills)
    return f'  <div style="display: flex; gap: 4px; padding: 10px 10px 0">{bars}</div>\n'

def game_header(sub='Sat 7:30 PM · FOX'):
    return f'''  <div style="display: flex; align-items: center; gap: 10px; padding: 10px 4px 0 12px">
    {pair(C, 'msu', 'ore', 40, 28)}
    <span style="flex: 1 1 auto; display: flex; flex-direction: column; gap: 1px">
      <span style="font-size: 15px; font-weight: 600">Michigan St at <span style="color: {C["t2"]}; font-weight: 400">#12 </span>Oregon</span>
      <span style="font-size: 13px; color: {C["t2"]}">{sub}</span>
    </span>
    <button aria-label="Close" style="width: 44px; height: 44px; border: 0; background: none; color: {C["tx"]}; display: flex; align-items: center; justify-content: center; padding: 0">{icon("close", 24)}</button>
  </div>
'''

def bottom(primary, prim_icon='up', bell=True):
    circ = f'width: 50px; height: 50px; flex: 0 0 auto; border-radius: 999px; border: 0; background: {C["surf2"]}; display: flex; align-items: center; justify-content: center; padding: 0'
    bell_html = f'<button aria-label="Alerts on for this game" style="{circ}; color: {{{{accent}}}}">{icon("bell", 22, fill="currentColor", sw=1.6)}</button>' if bell else ''
    return f'''  <div style="position: absolute; left: 12px; right: 12px; bottom: 28px; display: flex; gap: 10px">
    <a href="IGameNight.dc.html" style="flex: 1 1 auto; height: 50px; border-radius: 999px; background: {C["surf2"]}; color: {C["tx"]}; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600">{icon(prim_icon, 20, sw=2)}{primary}</a>
    {bell_html}
    <a href="SShare.dc.html" aria-label="Share" style="{circ}; color: {C["tx"]}; text-decoration: none">{icon("share", 21)}</a>
  </div>
'''

def eyebrow(t, top=34):
    return f'  <span style="padding: {top}px 20px 0; font-size: 15px; color: {C["t2"]}">{t}</span>\n'

def write(name, s):
    open(os.path.join(OUT, name), 'w').write(s)

# 1) The Move
chart = f'''  <svg width="358" height="232" viewBox="0 0 358 232" style="margin: 30px 16px 0; overflow: visible" aria-label="Oregon spread by day, from −4.5 on Sunday to −6.5 on Saturday">
    <defs><linearGradient id="mv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{{{{accent}}}}" stop-opacity=".28"/><stop offset="1" stop-color="{{{{accent}}}}" stop-opacity="0"/></linearGradient></defs>
    <g stroke="{C["surf2"]}" stroke-width="1" stroke-dasharray="3 5"><path d="M0 30H300"/><path d="M0 100H300"/><path d="M0 170H300"/></g>
    <g font-size="13" fill="{C["t3"]}" style="font-variant-numeric: tabular-nums"><text x="310" y="34">−6.5</text><text x="310" y="104">−5.5</text><text x="310" y="174">−4.5</text></g>
    <path d="M0 170H62V135H150V100H196V65H272V30H300V200H0Z" fill="url(#mv)"/>
    <path d="M0 170H62V135H150V100H196V65H272V30H300" fill="none" stroke="{{{{accent}}}}" stroke-width="3" stroke-linejoin="round"/>
    <g fill="{{{{accent}}}}"><circle cx="62" cy="135" r="4"/><circle cx="150" cy="100" r="4"/><circle cx="196" cy="65" r="4"/><circle cx="272" cy="30" r="4"/></g>
    <circle class="ping" cx="300" cy="30" r="6" fill="{{{{accent}}}}"/><circle cx="300" cy="30" r="6" fill="{{{{accent}}}}" stroke="#000000" stroke-width="2"/>
    <g font-size="13" fill="{C["t3"]}"><text x="0" y="226">Sun</text><text x="86" y="226" text-anchor="middle">Tue</text><text x="171" y="226" text-anchor="middle">Thu</text><text x="257" y="226" text-anchor="middle">Sat</text></g>
  </svg>
'''
s = head('Story, The Move') + frame_open(C) + segs([100 * 0.55, 0, 0]) + game_header()
s += eyebrow('Oregon Spread')
s += f'''  <div style="display: flex; align-items: baseline; gap: 14px; padding: 4px 20px 0; font-variant-numeric: tabular-nums">
    <span style="font-size: 104px; font-weight: 500; letter-spacing: -5px; line-height: 1">−6.5</span>
    <span style="display: flex; align-items: center; gap: 6px; font-size: 19px; color: {{{{accent}}}}">{beat(22)}from −4.5</span>
  </div>
  <span style="padding: 10px 20px 0; font-size: 17px; color: {C["t2"]}">Opened Sunday and moved 4 times this week</span>
'''
s += chart
s += f'  <span style="padding: 14px 20px 0; font-size: 13px; color: {C["t3"]}">DraftKings · Updated 2:10 PM</span>\n'
s += bottom('Open Game') + '</div>\n' + tail(C['accents'])
write('SMove1.dc.html', s)

# 2) Bets vs Money
def bar(label, ore, msu):
    return f'''  <div style="padding: 26px 20px 0; display: flex; flex-direction: column; gap: 10px; font-variant-numeric: tabular-nums">
    <span style="font-size: 15px; color: {C["t2"]}">{label}</span>
    <div style="display: flex; height: 14px; border-radius: 7px; overflow: hidden; gap: 3px"><span style="width: {ore}%; background: #F5F5F7"></span><span style="flex: 1 1 auto; background: {C["surf2"]}"></span></div>
    <div style="display: flex; justify-content: space-between; font-size: 17px"><span><span style="font-weight: 600">{ore}%</span> Oregon</span><span style="color: {C["t2"]}">{msu}% Michigan St</span></div>
  </div>
'''
s = head('Story, Bets vs Money') + frame_open(C) + segs([100, 45, 0]) + game_header()
s += eyebrow('Bets vs Money')
s += f'  <span style="padding: 8px 20px 0; font-size: 34px; font-weight: 500; letter-spacing: -0.8px; line-height: 1.12">More money than bets on Oregon</span>\n'
s += bar('Bets', 58, 42) + bar('Money', 74, 26)
s += f'''  <div style="margin: 30px 20px 0; padding: 14px 16px; border-radius: 16px; background: {C["surf"]}; display: flex; flex-direction: column; gap: 4px">
    <span style="font-size: 15px; font-weight: 600">Bets count tickets. Money counts dollars</span>
    <span style="font-size: 14.5px; color: {C["t2"]}; line-height: 1.4">When the two split, bigger bets are landing on one side</span>
  </div>
  <span style="padding: 14px 20px 0; font-size: 13px; color: {C["t3"]}">Updated 2:10 PM</span>
'''
s += bottom('Open Game') + '</div>\n' + tail(C['accents'])
write('SMove2.dc.html', s)

# 3) What to Know + Signal
s = head('Story, What to Know') + frame_open(C) + segs([100, 100, 35]) + game_header()
s += eyebrow('What to Know')
s += f'  <span style="padding: 8px 20px 10px; font-size: 34px; font-weight: 500; letter-spacing: -0.8px; line-height: 1.12">Around this move</span>\n'
for txt, tag in [('Oregon has won 4 straight', 'Form'), ("Oregon's starting QB is questionable", 'Injuries'), ('Michigan State is 2-5 ATS on the road', 'Form')]:
    s += f'  <a href="IGameNight.dc.html" style="display: flex; align-items: center; gap: 12px; margin: 0 20px; padding: 16px 0; border-bottom: 1px solid {C["line"]}; text-decoration: none; color: {C["tx"]}">{icon("arrow", 19, stroke="{{accent}}", sw=2.2)}<span style="flex: 1 1 auto; font-size: 18px">{txt}</span><span style="font-size: 13px; color: {C["t3"]}">{tag}</span></a>\n'
s += f'''  <div style="margin: 28px 20px 0; padding: 16px; border-radius: 16px; background: {C["surf"]}; display: flex; flex-direction: column; gap: 6px">
    <div style="display: flex; align-items: baseline; justify-content: space-between"><span style="font-size: 22px; font-weight: 500">Signal</span><span style="display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 600"><span style="width: 8px; height: 8px; border-radius: 999px; background: {{{{accent}}}}"></span>Leans Oregon</span></div>
    <span style="font-size: 14.5px; color: {C["t2"]}">Built from line movement, form and injuries</span>
  </div>
  <span style="position: absolute; left: 0; right: 0; bottom: 92px; text-align: center; font-size: 13px; color: {C["t3"]}">Swipe up for the full game · Swipe left for the next move</span>
'''
s += bottom('Open Game') + '</div>\n' + tail(C['accents'])
write('SMove3.dc.html', s)

# 4) Your Brief (The Analyst)
s = head('Story, Your Brief') + frame_open(C) + segs([30])
s += f'''  <div style="display: flex; align-items: center; gap: 10px; padding: 10px 4px 0 12px">
    <span style="width: 40px; height: 40px; border-radius: 999px; background: {C["surf"]}; display: flex; align-items: center; justify-content: center">{mark(C, 28)}</span>
    <span style="flex: 1 1 auto; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 15px; font-weight: 600">Your Brief</span><span style="font-size: 13px; color: {C["t2"]}">The Analyst · 9:00 AM</span></span>
    <button aria-label="Close" style="width: 44px; height: 44px; border: 0; background: none; color: {C["tx"]}; display: flex; align-items: center; justify-content: center; padding: 0">{icon("close", 24)}</button>
  </div>
'''
s += eyebrow('Saturday, November 21')
s += f'  <span style="padding: 8px 20px 8px; font-size: 34px; font-weight: 500; letter-spacing: -0.8px; line-height: 1.12">3 things in your sports today</span>\n'
for n, txt in [('1', 'Oregon moved from −4.5 to −6.5 since Sunday, the biggest move in college football this week'), ('2', 'The Bills at Chiefs total dropped from 49.5 to 47.5'), ('3', 'The Celtics are 8-2 at home and host the Lakers at 7:30 PM')]:
    s += f'  <div style="display: flex; gap: 16px; margin: 0 20px; padding: 16px 0; border-bottom: 1px solid {C["line"]}"><span style="flex: 0 0 auto; width: 18px; font-size: 26px; font-weight: 500; color: {C["t3"]}; line-height: 1.05">{n}</span><span style="font-size: 18px; line-height: 1.38">{txt}</span></div>\n'
s += f'  <span style="padding: 14px 20px 0; font-size: 13px; color: {C["t3"]}">Written by The Analyst from MGP data</span>\n'
s += bottom('Ask The Analyst', prim_icon='analyst', bell=False).replace('href="IGameNight.dc.html"', 'href="#a"') + '</div>\n' + tail(C['accents'])
write('SBrief.dc.html', s)

# 5) Today with the mixed story row
def circle(inner, label, bubble, unseen):
    ring = '{{accent}}' if unseen else C['surf2']
    return f'''    <a href="{'SBrief.dc.html' if label == 'Your Brief' else 'SMove1.dc.html'}" style="position: relative; flex: 0 0 auto; width: 100px; height: 146px; display: flex; flex-direction: column; align-items: center; text-decoration: none; color: {C["tx"]}">
      <span style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 2; padding: 7px 10px; border-radius: 14px; background: {C["surf2"]}; font-size: 12.5px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums">{bubble}<span aria-hidden="true" style="position: absolute; left: 14px; bottom: -5px; width: 8px; height: 8px; border-radius: 999px; background: {C["surf2"]}"></span></span>
      <span style="margin-top: 26px; width: 74px; height: 74px; box-sizing: border-box; border-radius: 999px; border: 2.5px solid {ring}; padding: 3px; display: flex">
        <span style="flex: 1 1 auto; border-radius: 999px; background: {C["surf"]}; display: flex; align-items: center; justify-content: center">{inner}</span>
      </span>
      <span style="margin-top: 7px; font-size: 13.5px; color: {C["tx"] if unseen else C["t2"]}; font-weight: {600 if unseen else 400}">{label}</span>
    </a>
'''
logo = lambda k: f'<img src="{L[k]}" alt="" width="38" height="38" style="width: 38px; height: 38px; object-fit: contain">'
s = head('Story Row on Today') + frame_open(C) + topbar(C)
s += title(C, 'Today', 'Saturday, November 21 · 12 games in your sports')
s += '  <div style="display: flex; gap: 4px; padding: 20px 8px 0; overflow: hidden">\n'
s += circle(mark(C, 40), 'Your Brief', '3 things today', True)
s += circle(logo('ore'), 'Oregon', '−4.5 → −6.5', True)
s += circle(logo('bos'), 'Celtics', '−4 → −5.5', True)
s += circle(f'<span style="color: {C["tx"]}">{icon("score", 30, sw=1.6)}</span>', 'Last Night', 'Who covered', False)
s += '  </div>\n'
s += section(C, 'College Football', 14)
s += today_row(C, G['ore'], 'IGameNight.dc.html') + today_row(C, G['uga'], 'IGameNight.dc.html')
s += section(C, 'NBA', 16)
s += today_row(C, G['bos'], 'IGameNight.dc.html') + today_row(C, G['den'], 'IGameNight.dc.html')
s += tabbar(C, 'Today', gamesHref='IGames.dc.html') + '</div>\n' + tail(C['accents'])
write('SToday.dc.html', s)

# 6) Share card (ad style: serif + ticket), 9:16
bg = '#0A0A0A'
s = head('Share Card', serif=True)
s += f'''<div style="position: relative; width: 390px; height: 693px; box-sizing: border-box; background: {bg}; color: #F5F5F7; font-family: {{{{ff}}}}; display: flex; flex-direction: column; align-items: center; overflow: hidden; padding: 34px 26px 0">
  <span style="display: flex; align-items: center; gap: 9px; align-self: flex-start">{mark(C, 30)}<span style="font-size: 15px; font-weight: 600; letter-spacing: 2.5px">MGP</span></span>
  <span style="align-self: flex-start; margin-top: 30px; font-family: 'Instrument Serif', Georgia, serif; font-size: 44px; line-height: 1.02; letter-spacing: -0.5px">The line moved</span>
  <div style="position: relative; margin-top: 26px; width: 100%; border-radius: 22px; background: #161618">
    <div style="padding: 20px 22px 18px; display: flex; flex-direction: column; gap: 6px">
      <span style="font-size: 13px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; color: #6E6E73">College Football · Sat 7:30 PM</span>
      <span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 34px; line-height: 1.05">Michigan State at Oregon</span>
    </div>
    <div aria-hidden="true" style="border-top: 2px dashed #2C2C2F; margin: 0 22px"></div>
    <span aria-hidden="true" style="position: absolute; left: -13px; top: 124px; width: 26px; height: 26px; border-radius: 999px; background: {bg}"></span>
    <span aria-hidden="true" style="position: absolute; right: -13px; top: 124px; width: 26px; height: 26px; border-radius: 999px; background: {bg}"></span>
    <div style="padding: 18px 22px 22px; display: flex; flex-direction: column; gap: 4px; font-variant-numeric: tabular-nums">
      <span style="font-size: 15px; color: #A1A1A6">Oregon spread</span>
      <span style="display: flex; align-items: baseline; gap: 14px"><span style="font-family: 'Instrument Serif', Georgia, serif; font-size: 96px; line-height: 1; color: {{{{accent}}}}"><span style="display: inline-block; transform: scaleX(0.62); margin-right: -12px">−</span>6.5</span><span style="font-size: 18px; color: #A1A1A6">from −4.5</span></span>
      <span style="font-size: 15px; color: #A1A1A6">Moved 4 times since Sunday</span>
    </div>
  </div>
  <span style="margin-top: 24px; font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 26px">Bet Smarter, Not Harder</span>
  <span style="margin-top: 6px; font-size: 14px; color: #A1A1A6">mgp-analytics.com</span>
  <span style="position: absolute; bottom: 18px; left: 0; right: 0; text-align: center; font-size: 11.5px; color: #6E6E73">Odds via DraftKings · Gambling problem? Call 1-800-GAMBLER</span>
</div>
''' + tail(C['accents']).replace('"$preview":{"width":390,"height":844}', '"$preview":{"width":390,"height":693}')
write('SShare.dc.html', s)
print('stories written')
