# Direction I, splits-first (D-053): Today, Pulse (Bets & Money, Trends, Results), Game page.
# Real data: DraftKings splits captured Nov 23 2026; trends and results from nflverse games + our stored splits.
import os, sys, csv
sys.path.insert(0, os.path.dirname(__file__))
from gen_i import NIGHT, L, ICON, icon, beat, mark, head, tail, frame_open, topbar, title, section
C = dict(NIGHT); C['t3'] = '#89898E'  # token value after the contrast fix (D-050)
OUT = sys.argv[1]
L.update({
 'cin':'/_blob/fd13859499ad890b6fa8a6252db59b9b','wsh':'/_blob/249125eb5c771841e4ddb1cdd4be0479','gb':'/_blob/6693f6a43ac4fb11a27782934269cda9',
 'lar':'/_blob/6a99f59ec158fec31f4d3401dcb18271','chi':'/_blob/eab03e4af08083c5cadecdd2f6fb3530','det':'/_blob/ac68903d8695abab820a431165955fcf',
 'den':'/_blob/c4983f18b1a0b0cd3d4cd1468fcca852','pit':'/_blob/ec939d8ccc209ce0787536921ef2b2e3','por':'/_blob/d9b2948030a7c3af5a78cafb60a0d37c',
 'p76':'/_blob/16714234ebac33b44f1ac31303d80d13','mem':'/_blob/6bfcf7784602ee2162ed8a4cc3565b5c','cha':'/_blob/1cdaa797c054ce5b211bf1958aae6863',
 'lac':'/_blob/9f67eea3d83d35279920bf7a752dbdd7','hou':'/_blob/6744fc84cabe343660a6820d22a4a35d','uta':'/_blob/b0a14193d5e281b1827abf3e31963f6a',
 'phi':'/_blob/63b18bd057d615b0821312c049eddca7','ne':'/_blob/3f2c08e325d89300ee6f2d40071834ca','jax':'/_blob/92b2d4c7cb8c0830a36d307b474c02e8','sea':'/_blob/3ebfaa57a2418ef05183f636a6f8977b','dal':'/_blob/451101d5323d6c0f077d92e2b5d7872b'})
ICON['pulse'] = '<polyline points="2,12 6,12 8.5,7 11.5,17 14,10 16,12 22,12"/>'
ICON['down'] = '<path d="M6 9l6 6 6-6"/>'
GREEN, RED = '{{accent}}', '#FF6B6B'
import re as _re
NB = lambda t: _re.sub(r'(\d+-\d+(?:-\d+)?)', r'<span style="white-space: nowrap">\1</span>', t)

def tabbar(active):
    items = [('Today','today','JToday.dc.html'),('Games','games','#t'),('Pulse','pulse','JPulse.dc.html'),('Alerts','bell','#t'),('The Analyst','analyst','#t')]
    out = []
    for label, ic, href in items:
        if label == active:
            out.append(f'<a href="{href}" style="height: 52px; border-radius: 999px; background: {C["tabOn"]}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: {C["tx"]}; text-decoration: none; font-size: 10.5px; font-weight: 600">{icon(ic, stroke=GREEN, sw=1.9)}{label}</a>')
        else:
            out.append(f'<a href="{href}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; color: {C["t2"]}; text-decoration: none; font-size: 10.5px; font-weight: 500">{icon(ic)}{label}</a>')
    fade = f'<div aria-hidden="true" style="position: absolute; left: 0; right: 0; bottom: 0; height: 130px; background: linear-gradient(to bottom, rgba(0,0,0,0), {C["bg"]} 55%); pointer-events: none"></div>'
    return fade + f'''  <nav aria-label="Tabs" style="position: absolute; left: 14px; right: 14px; bottom: 22px; height: 64px; border-radius: 999px; background: {C["tab"]}; border: 1px solid {C["tabBorder"]}; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; padding: 0 6px; box-shadow: {C["shadow"]}">
    {"".join(out)}
  </nav>
'''

def logo(k, d=34, img=None):
    img = img or int(d * 0.62)
    return f'<span style="flex: 0 0 auto; width: {d}px; height: {d}px; border-radius: 999px; background: {C["surf"]}; display: flex; align-items: center; justify-content: center"><img src="{L[k]}" alt="" width="{img}" height="{img}" style="width: {img}px; height: {img}px; object-fit: contain"></span>'

def pair(a, h, size=46, d=32):
    off = size - d
    c = lambda k, x, z: f'<span style="position: absolute; left: {x}px; top: {x}px; z-index: {z}; width: {d}px; height: {d}px; box-sizing: border-box; border-radius: 999px; background: {C["surf"]}; border: 2.5px solid {C["bg"]}; display: flex; align-items: center; justify-content: center"><img src="{L[k]}" alt="" width="{int(d*.62)}" height="{int(d*.62)}" style="width: {int(d*.62)}px; height: {int(d*.62)}px; object-fit: contain"></span>'
    return f'<span aria-hidden="true" style="position: relative; flex: 0 0 auto; width: {size}px; height: {size}px">{c(a,0,1)}{c(h,off,2)}</span>'

def tag(text):
    return f'<span style="display: inline-flex; align-items: center; gap: 4px; color: {GREEN}; font-weight: 500">{beat(17)}{text}</span>'

def segs(active):
    out = '  <div style="display: flex; gap: 4px; padding: 14px 12px 4px">\n'
    for t, href in [('Bets & Money', 'JPulse.dc.html'), ('Trends', 'JTrends.dc.html'), ('Leaders', 'JLeaders.dc.html'), ('Results', 'JResults.dc.html')]:
        st = f'background: {C["surf2"]}; color: {C["tx"]}' if t == active else f'color: {C["t2"]}'
        out += f'    <a href="{href}" style="flex: 0 0 auto; padding: 9px 13px; border-radius: 999px; font-size: 15px; text-decoration: none; {st}">{t}</a>\n'
    return out + '  </div>\n'

def pulse_title(sub, sport='NFL'):
    return f'''  <div style="padding: 10px 16px 0; display: flex; align-items: flex-end; justify-content: space-between">
    <div style="display: flex; flex-direction: column; gap: 6px">
      <h1 style="margin: 0; font-size: 34px; font-weight: 500; letter-spacing: -0.8px; line-height: 1.05">Pulse</h1>
      <span style="font-size: 15px; color: {C["t2"]}">{sub}</span>
    </div>
    <a href="#s" style="display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-radius: 999px; background: {C["surf"]}; color: {C["tx"]}; text-decoration: none; font-size: 15px">{sport}{icon("down", 16, sw=2)}</a>
  </div>
'''

def source(t, top=10):
    return f'  <span style="padding: {top}px 16px 0; font-size: 13px; color: {C["t3"]}">{t}</span>\n'

# ---------- 1) Today
def today_row(a, h, title_, time_, line, total, split_html, flag=None):
    f = f'<span style="margin-top: 2px; font-size: 14px">{tag(flag)}</span>' if flag else ''
    return f'''  <a href="JGame.dc.html" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px 16px; text-decoration: none; color: {C["tx"]}">
    {pair(a, h)}
    <span style="flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px">
      <span style="display: flex; justify-content: space-between; gap: 8px; font-size: 16.5px; letter-spacing: -0.2px"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{title_}</span><span style="flex: 0 0 auto; font-weight: 500; font-variant-numeric: tabular-nums">{line}</span></span>
      <span style="display: flex; justify-content: space-between; font-size: 14px; color: {C["t2"]}; font-variant-numeric: tabular-nums"><span>{time_}</span><span style="color: {C["t3"]}">{total}</span></span>
      <span style="font-size: 14px; color: {C["t2"]}; font-variant-numeric: tabular-nums">{split_html}</span>
      {f}
    </span>
  </a>
'''
W = lambda x: f'<span style="color: {C["tx"]}; font-weight: 500">{x}</span>'
s = head('Today, Splits First') + frame_open(C) + topbar(C)
s += title(C, 'Today', 'Monday, November 23 · 11 games in your sports')
s += section(C, 'NFL', 18)
s += today_row('cin', 'wsh', 'Bengals at Commanders', '8:15 PM · ESPN', 'CIN −6', 'O/U 54.5', f'{W("78%")} of money · {W("85%")} of bets on CIN')
s += section(C, 'NBA', 14)
s += today_row('por', 'p76', 'Trail Blazers at 76ers', '7:10 PM', 'PHI −3.5', 'O/U 231.5', f'{W("78%")} of money · {W("64%")} of bets on PHI')
s += today_row('mem', 'cha', 'Grizzlies at Hornets', '7:10 PM', 'MEM −3.5', 'O/U 216.5', f'{W("93%")} of money on CHA +3.5', 'Money vs Bets: 62% of bets on MEM')
s += today_row('lac', 'hou', 'Clippers at Rockets', '8:40 PM', 'HOU −12.5', 'O/U 225.5', f'{W("73%")} of money on LAC +12.5', 'Money vs Bets: 83% of bets on HOU')
s += today_row('uta', 'lal', 'Jazz at Lakers', '10:10 PM', 'LAL −13.5', 'O/U 228.5', f'{W("99%")} of money · {W("75%")} of bets on LAL')
s += source('Bets and money from DraftKings · Updated 3:05 PM', 6)
s += tabbar('Today') + '</div>\n' + tail(C['accents'])
open(os.path.join(OUT, 'JToday.dc.html'), 'w').write(s)

# ---------- 2) Pulse: Bets & Money
def board_section(name, sub):
    return f'''  <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 18px 16px 2px">
    <span style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 20px; font-weight: 500; letter-spacing: -0.3px">{name}</span><span style="font-size: 13.5px; color: {C["t3"]}">{sub}</span></span>
    <a href="#all" style="font-size: 15px; color: {C["t2"]}; text-decoration: none">See All</a>
  </div>
'''
def board_row(n, k, pick, ctx, big, small):
    return f'''  <a href="JGame.dc.html" style="display: flex; align-items: center; gap: 12px; margin: 0 16px; padding: 9px 0; border-bottom: 1px solid {C["line"]}; text-decoration: none; color: {C["tx"]}">
    <span style="width: 14px; font-size: 15px; color: {C["t3"]}; font-variant-numeric: tabular-nums">{n}</span>{logo(k, 32)}
    <span style="flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px"><span style="font-size: 16.5px; font-variant-numeric: tabular-nums">{pick}</span><span style="font-size: 13.5px; color: {C["t2"]}">{ctx}</span></span>
    <span style="flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; font-variant-numeric: tabular-nums"><span style="font-size: 17px; font-weight: 600">{big}</span><span style="font-size: 12.5px; color: {C["t3"]}">{small}</span></span>
  </a>
'''
s = head('Pulse, Bets and Money') + frame_open(C) + topbar(C)
s += pulse_title('Week 12 · Thanksgiving week') + segs('Bets & Money')
s += board_section('Most Money', 'Share of money on each spread')
s += board_row(1, 'den', 'Broncos −3', 'at Steelers · Fri', '82%', 'of money') + board_row(2, 'buf', 'Bills −3', 'vs Chiefs · Thu', '78%', 'of money') + board_row(3, 'cin', 'Bengals −6', 'at Commanders · Tonight', '78%', 'of money')
s += board_section('Money vs Bets', 'More money than bets on one side')
s += board_row(1, 'phi', 'Eagles +8.5', 'at Cowboys · 29% of bets', '65%', 'of money') + board_row(2, 'gb', 'Packers +123', 'at Rams · 58% of bets', '96%', 'of money') + board_row(3, 'lar', 'Under 44.5', 'Packers at Rams · 23% of bets', '71%', 'of money')
s += board_section('Most Bets', 'Share of bets on each spread')
s += board_row(1, 'den', 'Broncos −3', 'at Steelers · Fri', '91%', 'of bets') + board_row(2, 'cin', 'Bengals −6', 'at Commanders · Tonight', '85%', 'of bets')
s += tabbar('Pulse') + '</div>\n' + tail(C['accents'])
open(os.path.join(OUT, 'JPulse.dc.html'), 'w').write(s)

# ---------- 3) Pulse: Trends
def trend(kind, statement, ctx, k=None, league=False):
    icon_html = logo(k, 36) if k else f'<span style="flex: 0 0 auto; width: 36px; height: 36px; border-radius: 999px; background: {C["surf"]}; display: flex; align-items: center; justify-content: center">{mark(C, 24)}</span>'
    return f'''  <a href="JGame.dc.html" style="display: flex; gap: 12px; margin: 0 16px; padding: 14px 0; border-bottom: 1px solid {C["line"]}; text-decoration: none; color: {C["tx"]}">
    {icon_html}
    <span style="flex: 1 1 auto; display: flex; flex-direction: column; gap: 4px">
      <span style="font-size: 13px; color: {C["t3"]}">{kind}</span>
      <span style="font-size: 18px; line-height: 1.3; letter-spacing: -0.2px">{NB(statement)}</span>
      <span style="font-size: 14px; color: {C["t2"]}; font-variant-numeric: tabular-nums">{ctx}</span>
    </span>
  </a>
'''
s = head('Pulse, Trends') + frame_open(C) + topbar(C)
s += pulse_title('Week 12 · Thanksgiving week') + segs('Trends')
s += trend('NFL · Since Week 8', 'Favorites are 35-20 ATS', 'Home teams are 68-88 ATS this season')
s += trend('NFL · This Season', 'Sides with 70%+ of the money are 17-29-3 ATS', 'Weeks 3 to 9 · DraftKings money')
s += trend('Eagles at Cowboys · Thu 4:30 PM', 'Cowboys are 5-11 ATS on Thanksgiving since 2010', 'Cowboys −8.5 · 65% of money on the Eagles', 'dal')
s += trend('Chiefs at Bills · Thu 8:20 PM', 'Patrick Mahomes is 13-5-1 ATS as an underdog', 'Chiefs +3 · 78% of money on the Bills', 'kc')
s += trend('Broncos at Steelers · Fri 3:00 PM', 'Broncos are 8-2 ATS this season', 'Broncos −3 · 82% of money on the Broncos', 'den')
s += tabbar('Pulse') + '</div>\n' + tail(C['accents'])
open(os.path.join(OUT, 'JTrends.dc.html'), 'w').write(s)

# ---------- 4) Pulse: Results (real Week 8)
WK8 = [('ne', 'Patriots −7', 90, 'Patriots 24, Dolphins 19', 'No Cover'), ('det', 'Lions −3', 79, 'Lions 19, Vikings 15', 'Covered'),
       ('gb', 'Packers −3.5', 77, 'Packers 27, Panthers 19', 'Covered'), ('jax', 'Jaguars −1', 73, 'Jaguars 42, Colts 7', 'Covered'),
       ('dal', 'Cowboys −7', 71, 'Cardinals 33, Cowboys 30', 'No Cover'), ('sea', 'Seahawks −3', 68, 'Bears 34, Seahawks 17', 'No Cover'),
       ('lar', 'Rams −6.5', 67, 'Rams 24, Chargers 9', 'Covered')]
s = head('Pulse, Results') + frame_open(C) + topbar(C)
s += pulse_title('Week 8 · How the money did') + segs('Results')
s += f'''  <div style="padding: 18px 16px 6px; display: flex; align-items: baseline; gap: 14px; font-variant-numeric: tabular-nums">
    <span style="flex: 0 0 auto; white-space: nowrap; font-size: 56px; font-weight: 500; letter-spacing: -2px; line-height: 1">9-5</span>
    <span style="font-size: 15px; color: {C["t2"]}; line-height: 1.35">The side with the most money went 9-5 ATS in Week 8<br><span style="color: {C["t3"]}">Season: 42-56-5 (Weeks 3 to 9)</span></span>
  </div>
'''
for k, pick, pct, score, res in WK8:
    col = GREEN if res == 'Covered' else RED
    lg = logo(k, 32) if k in L else f'<span style="flex: 0 0 auto; width: 32px; height: 32px; border-radius: 999px; background: {C["surf"]}"></span>'
    s += f'''  <div style="display: flex; align-items: center; gap: 12px; margin: 0 16px; padding: 9px 0; border-bottom: 1px solid {C["line"]}">
    {lg}
    <span style="flex: 1 1 auto; display: flex; flex-direction: column; gap: 1px; font-variant-numeric: tabular-nums"><span style="font-size: 16px">{pct}% of money on {pick}</span><span style="font-size: 13.5px; color: {C["t2"]}">{score}</span></span>
    <span style="flex: 0 0 auto; font-size: 14px; font-weight: 600; color: {col}">{res}</span>
  </div>
'''
s += tabbar('Pulse') + '</div>\n' + tail(C['accents'])
open(os.path.join(OUT, 'JResults.dc.html'), 'w').write(s)

# ---------- 5) Game page: Eagles at Cowboys
def rec(team):
    w = l = t = 0
    for r in csv.DictReader(open('/home/user/nflverse/nfldata/data/games.csv')):
        if r['season'] != '2026' or r['result'] == '': continue
        if team not in (r['home_team'], r['away_team']): continue
        m = float(r['result']) * (1 if r['home_team'] == team else -1)
        w += m > 0; l += m < 0; t += m == 0
    return f'{w}-{l}' + (f'-{t}' if t else '')
def split_market(name, left, right, bets, money):
    def bar(label, a):
        return f'''      <div style="display: grid; grid-template-columns: 52px 38px 1fr 38px; align-items: center; gap: 8px; font-size: 14px; font-variant-numeric: tabular-nums">
        <span style="color: {C["t2"]}">{label}</span><span style="text-align: right; font-weight: 600">{a}%</span>
        <span style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 2px"><span style="width: {a}%; background: #F5F5F7"></span><span style="flex: 1 1 auto; background: {C["surf2"]}"></span></span>
        <span style="color: {C["t2"]}">{100 - a}%</span>
      </div>
'''
    return f'''    <div style="display: flex; flex-direction: column; gap: 7px; padding: 12px 0; border-bottom: 1px solid {C["line"]}">
      <div style="display: flex; justify-content: space-between; font-size: 15px; font-variant-numeric: tabular-nums"><span style="font-weight: 600">{name}</span><span style="color: {C["t2"]}">{left} · {right}</span></div>
{bar("Bets", bets)}{bar("Money", money)}    </div>
'''
circ = f'width: 44px; height: 44px; border-radius: 999px; border: 0; background: {C["surf"]}; display: flex; align-items: center; justify-content: center; padding: 0; text-decoration: none'
s = head('Game Page, Splits First') + frame_open(C)
s += f'''  <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 0">
    <a href="JToday.dc.html" aria-label="Back" style="{circ}; color: {C["tx"]}">{icon("back", 22)}</a>
    <div style="display: flex; gap: 10px"><button aria-label="Get alerts for this game" style="{circ}; color: {C["tx"]}">{icon("bell", 21, sw=1.6)}</button><button aria-label="Share" style="{circ}; color: {C["tx"]}">{icon("share", 20)}</button></div>
  </div>
  <div style="padding: 14px 16px 0; display: flex; flex-direction: column; gap: 8px">
'''
for k, nm, r in [('phi', 'Eagles', rec('PHI')), ('dal', 'Cowboys', rec('DAL'))]:
    s += f'    <div style="display: flex; align-items: center; gap: 12px">{logo(k, 38, 24)}<span style="flex: 1 1 auto; font-size: 28px; font-weight: 500; letter-spacing: -0.6px">{nm}</span><span style="font-size: 15px; color: {C["t3"]}; font-variant-numeric: tabular-nums">{r}</span></div>\n'
s += f'''    <span style="font-size: 15px; color: {C["t2"]}">Thanksgiving · Thu 4:30 PM · DAL −8.5 · O/U 47.5</span>
  </div>
  <div style="display: flex; gap: 4px; padding: 14px 12px 0; white-space: nowrap; overflow: hidden">
'''
for t, on in [('Bets & Money', True), ('Trends', False), ('What to Know', False), ('Odds', False)]:
    st = f'background: {C["surf2"]}; color: {C["tx"]}' if on else f'color: {C["t2"]}'
    s += f'    <a href="#s" style="flex: 0 0 auto; padding: 9px 15px; border-radius: 999px; font-size: 15px; text-decoration: none; {st}">{t}</a>\n'
s += '  </div>\n  <div style="padding: 2px 16px 0">\n'
s += split_market('Spread', 'PHI +8.5', 'DAL −8.5', 29, 65)
s += split_market('Moneyline', 'PHI +324', 'DAL −411', 24, 57)
s += f'''  </div>
  <div style="margin: 12px 16px 0; display: flex; gap: 8px; font-size: 15px; line-height: 1.4; color: {C["tx"]}"><span style="flex: 0 0 auto; margin-top: 1px; color: {GREEN}">{beat(18)}</span><span><span style="color: {GREEN}; font-weight: 600">Money vs Bets</span> 65% of the money is on the Eagles +8.5, while 71% of bets are on the Cowboys</span></div>
'''
s += section(C, 'Trends', 16)
for txt in ['Cowboys are 5-11 ATS on Thanksgiving since 2010', 'Cowboys are 6-15 ATS as a favorite since 2024', 'Eagles are 2-8 ATS this season']:
    s += f'  <div style="display: flex; align-items: center; gap: 12px; margin: 0 16px; padding: 10px 0; border-bottom: 1px solid {C["line"]}">{icon("arrow", 17, stroke=GREEN, sw=2.2)}<span style="font-size: 16px">{NB(txt)}</span></div>\n'
s += tabbar('Today') + '</div>\n' + tail(C['accents'])
open(os.path.join(OUT, 'JGame.dc.html'), 'w').write(s)
print('J written')

# ---------- 6) Pulse: Leaders (college football, real data from MGP's stored closing lines)
import json as _json
CFB = {'290':'/_blob/a1a1adff6d6047cc1d08209fe8a42961','154':'/_blob/2f23b00b3fed6aa71b7e6cd549b8caf2','2348':'/_blob/59021d600a2bc00b8bed0bb1b303e624',
 '2335':'/_blob/b70557715b2a877f87aff4c689cc8f28','2751':'/_blob/a78d09c669aba166b7b552958587bf78','2005':'/_blob/fdcd0066cea9be96a2b935218d7322e7',
 '344':'/_blob/230de0c13124d7a4bd1151c58e07ba9f','248':'/_blob/77c96d761fc79bc688ada62522353c47','25':'/_blob/5dfbb4c649416ed62490cab86f026494',
 '2534':'/_blob/107e6c055b5008a01b0e10522b40da0a','36':'/_blob/6a977f072e3323c269840c846781a828','197':'/_blob/f5a533068999d81f3551a38ac06ce7ce',
 '24':'/_blob/6c7213456c570993ed015b0841f72832','2390':'/_blob/a59338c753e968e35f407281e2cc30c8'}
for k, v in CFB.items(): L['cfb' + k] = v
SCHOOL = lambda n: ' '.join(n.split()[:-1]) if n.split()[-1] not in ('State',) else n
SHORT = {'Georgia Southern Eagles':'Georgia Southern','Wake Forest Demon Deacons':'Wake Forest','Louisiana Tech Bulldogs':'Louisiana Tech','Liberty Flames':'Liberty',
 'Wyoming Cowboys':'Wyoming','Air Force Falcons':'Air Force','Mississippi State Bulldogs':'Mississippi State','Houston Cougars':'Houston',
 'California Golden Bears':'California','Sam Houston Bearkats':'Sam Houston','Colorado State Rams':'Colorado State','Oklahoma State Cowboys':'Oklahoma State',
 'Stanford Cardinal':'Stanford','Miami Hurricanes':'Miami'}
LD = _json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'research', '2026-11-23-public-data', 'cfb-leaders-since-week4.json')))
def leader_row(n, team, rec_, tid, unit='ATS'):
    return f'''  <a href="#team" style="display: flex; align-items: center; gap: 12px; margin: 0 16px; padding: 8px 0; border-bottom: 1px solid {C["line"]}; text-decoration: none; color: {C["tx"]}">
    <span style="width: 14px; font-size: 15px; color: {C["t3"]}; font-variant-numeric: tabular-nums">{n}</span>{logo('cfb' + tid, 32)}
    <span style="flex: 1 1 auto; font-size: 16.5px">{SHORT.get(team, team)}</span>
    <span style="flex: 0 0 auto; display: flex; align-items: baseline; gap: 5px; font-variant-numeric: tabular-nums; white-space: nowrap"><span style="font-size: 17px; font-weight: 600">{rec_}</span><span style="font-size: 12.5px; color: {C["t3"]}">{unit}</span></span>
  </a>
'''
s = head('Pulse, Leaders') + frame_open(C) + topbar(C)
s += pulse_title('Since Week 4 · 562 games', 'College Football') + segs('Leaders')
s += board_section('Best Against the Spread', 'Covers minus misses')
for i, (t, r, tid) in enumerate(LD['best'], 1): s += leader_row(i, t, r, tid)
s += board_section('Worst Against the Spread', 'Fewest covers')
for i, (t, r, tid) in enumerate(LD['worst'][:3], 1): s += leader_row(i, t, r, tid)
s += board_section('Most Overs', 'Games that went over the total')
for i, (t, r, tid) in enumerate(LD['overs'][:3], 1): s += leader_row(i, t, r, tid, 'O/U')
s += tabbar('Pulse') + '</div>\n' + tail(C['accents'])
open(os.path.join(OUT, 'JLeaders.dc.html'), 'w').write(s)
print('leaders written')
