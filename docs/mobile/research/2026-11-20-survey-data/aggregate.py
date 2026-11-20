import json, glob, sys
S=sys.argv[1]
R=[json.load(open(f)) for f in sorted(glob.glob(S+'/[A-D].json'))]
names={'A':'Get an edge on the books.','B':'Beat the sportsbooks.','C':'The upper hand the pros have. Now yours.','D':'Level the playing field.','E':'Bet smarter, not harder.','F':"See where the money's moving.",'G':'Every number you need. One app.','H':'Bet like a pro.'}
N=sum(r['n'] for r in R); print('panels',[r['replicate'] for r in R],'N',N)
def tot(k): 
    out={}
    for r in R:
        for a,b in r[k].items(): out[a]=out.get(a,0)+b
    return out
fav=tot('q1_favorite')
print('\nQ1 favorite (share) | mean appeal (avg of panels) | per-panel favorite rank')
for h in sorted(fav,key=lambda x:-fav[x]):
    appeal=sum(r['q1_mean_appeal'][h] for r in R)/len(R)
    ranks=[sorted(r['q1_favorite'],key=lambda x:-r['q1_favorite'][x]).index(h)+1 for r in R]
    print(f"{h} {fav[h]:4d} {fav[h]/N:5.1%}  appeal {appeal:.2f}  ranks {ranks}  {names[h]}")
if any('q1_compliance_flags' in r for r in R):
    for r in R:
        if 'q1_compliance_flags' in r: print('compliance flags (industry panel, of 250):', r['q1_compliance_flags'])
for k,label in (('q2_first_screen','Q2 first screen'),('q5_signup_moment','Q5 signup moment')):
    t=tot(k); print('\n'+label); 
    for a in sorted(t,key=lambda x:-t[x]): print(f"  {a:32s} {t[a]:4d} {t[a]/N:5.1%}  per panel {[r[k][a] for r in R]}")
for k,label in (('q3_would_pay','Q3 would pay (multi)'),('q4_distrust','Q4 distrust (multi)')):
    t=tot(k); print('\n'+label)
    for a in sorted(t,key=lambda x:-t[x]): print(f"  {a:38s} {t[a]:4d} {t[a]/N:5.1%}")
seg=tot('segments'); print('\nsegments',seg)
print('\nfavorite by segment per panel:'); [print(' ',r['replicate'],r['q1_favorite_by_segment']) for r in R]
