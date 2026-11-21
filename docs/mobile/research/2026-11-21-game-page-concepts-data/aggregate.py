import json,glob,sys
S=sys.argv[1]; R=[json.load(open(f)) for f in sorted(glob.glob(S+'/[A-D].json'))]; N=sum(r['n'] for r in R)
names={'S':'MGP Score (0-100 per side)','K':'Start Here (ranked facts)','V':'Side-by-Side bars','A':'Ask The Analyst','none':'None'}
def tot(k):
    o={}
    for r in R:
        for a,b in r[k].items(): o[a]=o.get(a,0)+b
    return o
print('panels',[r['replicate'] for r in R],'N',N)
t=tot('q1_open_before_bet'); print('\nQ1 most likely to make you open MGP before a bet')
for a in sorted(t,key=lambda x:-t[x]): print(f"  {names[a]:28s} {t[a]:4d} {t[a]/N:5.1%}  per panel {[r['q1_open_before_bet'][a] for r in R]}")
print('\nQ2 usefulness 1-5 (avg of panels)')
for a in ['K','V','S','A']: print(f"  {names[a]:28s} {sum(r['q2_mean_useful'][a] for r in R)/len(R):.2f}  per panel {[r['q2_mean_useful'][a] for r in R]}")
for k,l in (('q3_score_trust','Q3 MGP Score trust'),('q4_score_effect_on_app_trust','Q4 Score effect on trust in the app'),('q6_places_checked','Q6 places checked before a bet')):
    t=tot(k); print('\n'+l)
    for a in t: print(f"  {a:32s} {t[a]:4d} {t[a]/N:5.1%}  per panel {[r[k][a] for r in R]}")
t=tot('q5_check_before_bet'); print('\nQ5 checked before betting (multi)')
for a in sorted(t,key=lambda x:-t[x]): print(f"  {a:22s} {t[a]:4d} {t[a]/N:5.1%}")
for r in R:
    if 'q7_risk_flags' in r: print('\nQ7 industry risk flags (of 250):', r['q7_risk_flags'])
