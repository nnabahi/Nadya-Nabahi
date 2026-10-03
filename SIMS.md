# Candidate sims

A planning list only. Nothing here is on the site, and nothing on this list
gets a page or a card on Toys n' Sims until nadya drives it, one sim at a
time.

Rows come from the old `SIMS.md` (git commit `8e68754`). Genres were
removed: nadya picks them when a sim goes live.

## Status

`idea` → `planning` → `checking algorithm` → `building page` → `live`, or `skip`.

- **idea**: worth building someday. Nothing has been done yet.
- **planning**: a thread is open and the plan doc is being agreed.
- **checking algorithm**: the math code is written and is being compared with nadya's Python.
- **building page**: the four-quadrant page is being made.
- **live**: on the site with nadya's card text.
- **skip**: not going on the site.

The thread column names the project thread where the sim is being worked on.

Rows starting with **D** are nadya's Desmos ideas. Their formulas are under
"Idea notes" at the bottom of this file. Their names are working names that
Claude wrote from the formulas, so rename them freely.

## The list

| Sim | nadya's Python files | Old site JS (at `8e68754`) | Status | Thread |
| --- | --- | --- | --- | --- |
| Random connected N-colouring | `Random_Connected_coloring.py` | `js/sims/connectedcoloring.js` | planning | Scope the domain drawing tool |
| 1D cellular automata | | `js/sims/automata.js` | idea | |
| Abelian sandpile | | `js/sims/sandpiles.js` | idea | |
| Random walk coloring | `RandomColoredWalk*.py`, `RandomColoredWalkOnLTaurus*.py` | `js/sims/walkcoloring.js` | building page | Random walk coloring |
| Random sequential tile packing | `circlepacking.py`, `circlingpackingdegrees.py`, `growing_circles_*` | `js/sims/tilepacking.js` | idea | |
| Gradient percolation | (from `gradient-percolation.html`) | `js/sims/gradientpercolation.js` | idea | |
| Random block growth | `RandBlockStack.py` | `js/sims/blockgrowth.js` | idea | |
| Lattice path counting | | `js/sims/pathcount.js` | idea | |
| Digit-rewriting rules | `DigitFun.py`, `BaseFun.py` | | idea | |
| Competing walks on a line | `competingwalk1d.py`, `competingwalks1dclaude.py` | | idea | |
| Dyadic walk | `DyadicWalk/` | | idea | |
| Random bridges / mountains | `randombrownianbridgeellipsecut.py`, `randmountain.py`, `randonesidedmountain.py` | | idea | |
| Coin-toss convergence | `quickndirtycointossconvergence.py` | | idea | |
| Random matrix products | `randmatAB.py`, `randmatprod.py`, `randmatcltadd.py`, `randmatcltmul.py` | | idea | |
| Random stochastic matrices | `randstochasticmat.py` | | idea | |
| Random tilings | `RANDOMTILINGS/tiling_mcmc.py`, `tiling_animation.py`, old `RandomTilings.js` | | idea | |
| Random billiards / clipping | `randbilliards.py`, `gptcircleclipping.py` | | idea | |
| Growing circles / interface tracking | (`growing_circles_analysis*.png`, `interface_displacement_data.csv`) | | idea | |
| Fractal percolation | `randomfractalpercolation.py`, `fracperc.py` | | idea | |
| Antisocial cells | `AntisocialCells/AntisocialCells.py` | | idea | |
| Durrett-style growth model | `DURRETT.py` | | idea | |
| Random trees | `randtrees.py`, `randsmallworldtrees.py` | | idea | |
| Partitions | `Partitions.py` | | idea | |
| Graph explorations | `Graph/FirstGraphs.py` | | idea | |
| Continued / base-B fraction expansions | `FractionExpansion.py`, `ContFracWithFunc.py`, `RandomBaseBNumbers.py` | | idea | |
| Periodic-rule Fibonacci-like sequences | `periodicfibonnaci.js`, `fib.py` | | idea | |
| Ulam sequence | `Ulam.py` | | idea | |
| D1: Product over a random walk with positive steps | Desmos | | idea | |
| D2: Random sequence shifted left/right with weight α | Desmos | | idea | |
| D3: Binomial average of a random sequence | Desmos | | idea | |
| D4: Alternating sequence times a Gaussian bump | Desmos | | idea | |
| D5: Digits weights | Desmos | | idea | |
| D6: Random tiling (c, w, b recurrences) | Desmos | | idea | |
| D7: Digit probability | Desmos | | idea | |
| D8: Lattice paths with parity rules | Desmos | | idea | |
| D9: Lattice paths with mod I₁, I₂ rules (polygonal numbers) | Desmos | | idea | |
| D10: Repeated uniform densities f_a1, f_a2, f_a3 | Desmos | | idea | |
| D11: Base-2 and base-3 weighted densities (p, q / r, s, t) | Desmos | | idea | |
| D12: Products of random 2x2 column-stochastic matrices | Desmos | | idea | |
| D13: Random products of two fixed matrices A, B | Desmos | | idea | |
| D14: Random disks in the unit disk | Desmos | | idea | |
| D15: Random-walk averaging of sin(1/x) | Desmos | | idea | |
| D16: Random base-b digits with random weights | Desmos | | idea | |
| D17: Move-to-front list | Desmos | | idea | |
| D18: Tilings by blocks of length l (counts, mean, variance, density) | Desmos | | idea | |
| D19: Random epicycles (Poisson radii and speeds) | Desmos | | idea | |

## How a sim goes from idea to live

1. nadya picks the sim and starts a thread named after it, pasting her Python.
2. A plan doc (the math, the algorithm, defaults, controls, statistics, the picture). nadya OKs it.
3. The algorithm, plus a check page that compares it with her Python and with known answers. nadya OKs it.
4. The four-quadrant page. nadya OKs how it looks.
5. nadya writes the card text and genres, and merges. Status becomes `live`.

Old site JS is a starting point only. It gets the same checks as new code.

## Idea notes (Desmos formulas from nadya, 2026-10-03)

Copied exactly as nadya pasted them (Desmos LaTeX). Numbers match the "D" rows
in the table. Each one's thread starts from these.

### D1
```
u(n) > 0 is a step for n \in Z (usually i.i.d.)
X(n) is a walk with X(0)=0, X(n)-X(n-1)=u(n)
p\left(n,x\right)=\left\{n=0:x,1-\frac{x}{X\left(n\right)}\right\}f_{0}\left(x\right)=\prod_{n=-N}^{N}p\left(n,x\right)
L=\sqrt{4d\operatorname{random}\left(\right)+\left(1-d\right)^{2}} (or as needed to make X(n) stationary)
x_{0}=\operatorname{uniformdist}\left(0,L\right).\operatorname{random}\left(\right)
f\left(x\right)=f_{0}\left(x-x_{0}\right)
F\left(x\right)=\int_{0}^{x}f\left(t\right)dt\left\
M=lim_{x\to\infty}\left(\frac{1}{2x}\int_{-x}^{x}F_{0}\left(t\right)dt\right)
F\left(x\right)=F_{0}\left(x\right)-M
g\left(x\right)=\frac{d}{dx}f\left(x\right)
```

### D2
```
f_0(x) = S[x]
S=\left[a,b\right].\operatorname{random}\left(300\right)
f_n(x) = \alphaf_{n-1}(x-w) + (1-\alpha)f_{n-1}(x+w)
```

### D3
```
S\left(n\right)=\frac{1}{2^{n}}\sum_{m=0}^{n}\operatorname{nCr}\left(n,m\right)s\left(2m-n\right)
s\left(x\right)=\left[a,b,c\right].\operatorname{random}
```

### D4
```
S\left(n\right)=\frac{1}{2}\left(\left(s_{0}+s_{1}\right)+\left(s_{0}-s_{1}\right)\left(-1\right)^{n}\right)
s\left(x\right)=S\left(\operatorname{floor}\left(x\right)\right)+\left(x-\operatorname{floor}\left(x\right)\right)\left(S\left(\operatorname{floor}\left(x\right)+1\right)-S\left(\operatorname{floor}\left(x\right)\right)\right)
b\left(x\right)=Ae^{-\frac{\left(x-B\right)^{2}}{2C^{2}}}
c\left(x\right)=b\left(x\right)s\left(x\right)
```

### D5 (digits weights)
```
\int_{0}^{m}\left(\operatorname{nCr}\left(m-1,x-1\right)p^{x}\left(1-p\right)^{m-x}\right)\left(1-2^{-x}\right)dx
P\left(n,k\right)=\operatorname{nCr}\left(n,k\right)p^{k}\left(1-p\right)^{n-k}
A\left(n,k\right)=\frac{k}{n}\left(1-2^{-k}\right)
f\left(x\right)=P\left(m,x\right)A\left(m,x\right)
```

### D6 (random tiling)
```
c\left(n\right)=c\left(n-2\right)+c\left(n-3\right)
w\left(n\right)=w\left(n-2\right)+w\left(n-3\right)+c\left(n\right)
b\left(n\right)=b\left(n-2\right)+b\left(n-3\right)+c\left(n-3\right)
W\left(x\right)=\frac{2w\left(x\right)}{xc\left(x\right)}
B\left(x\right)=\frac{b\left(x\right)}{xc\left(x\right)}
```

### D7 (digit probability)
```
E\left(n\right)=\left(1-\frac{1}{2^{n}}\right)\left(\frac{p_{0}\left(p_{0}^{n}p_{1}-np_{0}p_{1}^{n}+\left(n-1\right)p_{1}^{n+1}\right)}{\left(p_{0}-p_{1}\right)^{2}}+p_{1}^{n}\right)
```

### D8
```
a\left(i,x\right)=\left\{\left\{x=0\right\}=1:1,\ \left\{i=0\right\}=1:1,\left\{\operatorname{mod}\left(i,2\right)=1\right\}=1:a\left(i,x-1\right)+a\left(i-1,x\right),\left\{\operatorname{mod}\left(i,2\right)=0\right\}\left\{\operatorname{mod}\left(x,2\right)=0\right\}=1:a\left(i,x-1\right)+a\left(i-1,x\right),\left\{\operatorname{mod}\left(i,2\right)=0\right\}\left\{\operatorname{mod}\left(x,2\right)=1\right\}=1:a\left(i,x-1\right)\right\}
b\left(n,k\right)=a\left(n-k,k\right)
B\left(t,k\right)=\frac{b\left(t,k\right)}{\max\left(\left[b\left(t,k_{0}\right)\ \operatorname{for}\ k_{0}=\left[0,...,t\right]\right]\right)}
\left(1-\frac{k}{t},\frac{k}{t},B\left(t,k\right)\right)\operatorname{for}k=\left[0,...,t\right]

or 
I=\left[1,2\right]
L=I.\operatorname{count}
a\left(x,y\right)=\left\{x=0:1,\ y=0:1,\ \left\{x\ge1\right\}\left\{y\ge1\right\}=1:\ a\left(x,y-1\right)+a\left(x-1,y\right)\right\}
\left(1-\frac{k}{t},\frac{k}{t},\frac{a\left(t-k,k\right)}{\max\left(\left[a\left(t-k_{0},k_{0}\right)\ \operatorname{for}\ k_{0}=\left[0,...,t\right]\right]\right)}\right)\ \operatorname{for}\ k\ =\ \left[0,\ ...\ ,\ t\right]
b\left(x,y\right)=\left\{x=0:1,\ y=0:1,\ \left\{\operatorname{mod}\left(y,=1:\ a\left(x,y-1\right)+a\left(x-1,y\right)\right)\right\}\right\}

or
a\left(i,x\right)=\left\{\left\{x=0\right\}=1:1,\ \left\{i=0\right\}=1:1,\left\{\operatorname{mod}\left(i,2\right)=1\right\}=1:a\left(i,x-1\right)+a\left(i-1,x\right),\left\{\operatorname{mod}\left(i,2\right)=0\right\}\left\{\operatorname{mod}\left(x,2\right)=0\right\}=1:a\left(i,x-1\right)+a\left(i-1,x\right),\left\{\operatorname{mod}\left(i,2\right)=0\right\}\left\{\operatorname{mod}\left(x,2\right)=1\right\}=1:a\left(i,x-1\right)\right\}
b\left(n,k\right)=a\left(n-k,k\right)\left\{0\le k\le n\right\}
B=\left[b\left(t,k_{0}\right)\ \operatorname{for}\ k_{0}=\left[0,...,t\right]\right]
\frac{b\left(t,k\right)}{\max\left(\left[b\left(t,k_{0}\right)\ \operatorname{for}\ k_{0}=\left[0,...,t\right]\right]\right)}
```

### D9
```
a\left(x,y\right)=\left\{\left\{x=0:1,y=0:1\right\}=1,\left\{\operatorname{mod}\left(y,2\right)=1:1,0\right\}\left\{\operatorname{mod}\left(x,I_{1}\right)=0:1,0\right\}=1:a\left(x-1,y\right)+a\left(x,y-1\right),\left\{\operatorname{mod}\left(y,2\right)=0:1,0\right\}\left\{\operatorname{mod}\left(x,I_{2}\right)=0:1,0\right\}=1:a\left(x-1,y\right)+a\left(x,y-1\right),a\left(x-1,y\right)\right\}
Fix I_1 = 1. A_0 is always (1), A_1 is always (n), A_2 is always the n+2-agonal numbers
a_{0}\left(x\right)=1
a_{1}\left(x\right)=x+1
a_{2}\left(x\right)=\frac{1}{2}\left(\operatorname{floor}\left(\frac{x}{I_{2}}\right)+1\right)\left(I_{2}\operatorname{floor}\left(\frac{x}{I_{2}}\right)+2\right)
```

### D10
```
f_{a1}\left(x\right)=\left\{a_{0}\le x\le b_{0}:\frac{1}{b_{0}-a_{0}},0\right\}
f_{a2}\left(x\right)=\frac{2}{\left(b_{0}-a_{0}\right)^{2}}\left(\left(b_{0}-x\right)\ln\left(\frac{b_{0}-a_{0}}{b_{0}-x}\right)+\left(x-a_{0}\right)\ln\left(\frac{b_{0}-a_{0}}{x-a_{0}}\right)\right)
f_{a3}\left(x\right)=\int_{x}^{b_{0}}\int_{a_{0}}^{x}\left(\frac{\left(f_{a2}\left(x\right)\right)^{2}}{t-s}\right)dsdt
```

### D11
```
f\left(i,x\right)=\left\{\left\{i=1\right\}\left\{0\le x\le\frac{1}{2}\right\}=1:2q,\left\{i=1\right\}\left\{\frac{1}{2}\le x\le1\right\}=1:2p,\left\{i=1\right\}=1:0,\operatorname{floor}\left(\operatorname{mod}\left(2^{i}x,2\right)\right)=0:2qf\left(i-1,x\right),\operatorname{floor}\left(\operatorname{mod}\left(2^{i}x,2\right)\right)=1:2pf\left(i-1,x\right)\right\}
g\left(i,x\right)=\left\{\left\{i=1\right\}\left\{0\le x\le\frac{1}{3}\right\}=1:3t,\left\{i=1\right\}\left\{\frac{1}{3}\le x\le\frac{2}{3}\right\}=1:3r,\left\{i=1\right\}\left\{\frac{2}{3}\le x\le1\right\}=1:3s,\left\{i=1\right\}=1:0,\operatorname{floor}\left(\operatorname{mod}\left(3^{i}x,3\right)\right)=0:3tf\left(i-1,x\right),\operatorname{floor}\left(\operatorname{mod}\left(3^{i}x,3\right)\right)=1:3rf\left(i-1,x\right),\operatorname{floor}\left(\operatorname{mod}\left(3^{i}x,3\right)\right)=2:3sf\left(i-1,x\right)\right\}
```

### D12
```
a\left(n,k\right)=\operatorname{random}\left(\right)
b\left(n,k\right)=\operatorname{random}\left(\right)
c\left(n,k\right)=1-a\left(n,k\right)
d\left(n,k\right)=1-b\left(n,k\right)
s\left(n,t\right)=\left\{t=0:\left(1,0\right),\left(a\left(n,t\right)s\left(n,t-1\right).x+b\left(n,t\right)s\left(n,t-1\right).y,c\left(n,t\right)s\left(n,t-1\right).x+d\left(n,t\right)s\left(n,t-1\right).y\right)\right\}
\operatorname{histogram}\left(\left[s\left(n,20\right).x\operatorname{for}n=\left[1,...,N\right]\right],0.01\right)
```

### D13
```
A\left(x\right)=\left(0.9x.x+0.8x.y,0.1x.x+0.2x.y\right)
B\left(x\right)=\left(0.6x.x+0.3x.y,0.4x.x+0.7x.y\right)
s\left(n,t\right)=\left\{t=0:\left(1,0\right),w\left(n,t\right)=0:A\left(s\left(n,t-1\right)\right),B\left(s\left(n,t-1\right)\right)\right\}
w\left(n,t\right)=\operatorname{floor}\left(2\operatorname{random}\left(\right)\right)
L=\left[s\left(n,t_{0}\right).x\operatorname{for}n=\left[1,...,N\right]\right]
\operatorname{histogram}\left(L,0.0001\right)
```

### D14
```
U\left(k\right)=2\pi\operatorname{random}\left(\right)
M\left(k\right)=\operatorname{random}\left(\right)^{s}
p\left(k\right)=M\left(k\right)\left(\cos\left(U\left(k\right)\right),\sin\left(U\left(k\right)\right)\right)
r\left(k\right)=\left\{k=1:1-M\left(1\right),\sum_{i=1}^{k-1}\left\{\left|p\left(k\right)-p\left(i\right)\right|-r\left(i\right)>0,0\right\}=k-1:\min\left(\min\left(1-M\left(k\right),\left[\left|p\left(k\right)-p\left(j\right)\right|-r\left(j\right)\operatorname{for}j=\left[1,...,k-1\right]\right]\right)\right),0\right\}
```

### D15
```
p\left(i,k\right)=\operatorname{random}\left(\right)
a\left(i,x,k\right)=\left\{k=0:\sin\left(\frac{1}{x}\right),p\left(i,k\right)a\left(i,x+1,k-1\right)+\left(1-p\left(i,k\right)\right)a\left(i,x-1,k-1\right)\right\}
```

### D16
```
P_{0}=\tan\left(\frac{\pi}{2}\operatorname{random}\left(b\right)\right)
P=\frac{1}{\operatorname{total}\left(P_{0}\right)}P_{0}
D\left(n\right)=\operatorname{discretedist}\left(\left[0...b-1\right],P\right).\operatorname{random}\left(d\right)
X=\left[\sum_{k=1}^{d}b^{-k}D\left(n\right)\left[k\right]\operatorname{for}n=\left[1...N\right]\right]
F_{0}=\left[\sum_{n=1}^{N}\left\{X\left[n\right]\le kb^{-d}:1,0\right\}\operatorname{for}k=\left[0...b^{d}\right]\right]
\left[\left(kb^{-d},\frac{1}{N}F_{0}\left[k+1\right]\right)\operatorname{for}k=\left[0...b^{d}\right]\right]
```

### D17
```
E_{max}=1000
E=\operatorname{discretedist}\left(\left[1...E_{max}\right],\left[p_{exp}\left(1-p_{exp}\right)^{\left(n-1\right)}\operatorname{for}n=\left[1...E_{max}\right]\right]\right)
u=E.\operatorname{random}\left(N\right)
P_{pow}=\left[n^{s}\operatorname{for}n=\left[1...P_{max}\right]\right]
P=\operatorname{discretedist}\left(\left[1...P_{max}\right],\frac{1}{\operatorname{total}\left(P_{pow}\right)}P_{pow}\right)
P.\operatorname{random}\left(N\right)
u_{max}=2\max\left(u\right)
\left[\left(n,X\left(N\right)\left[n\right]\right)\operatorname{for}n=\left[1...u_{max}\right]\right]
X_{0}=\left[i\operatorname{for}i=\left[1...E_{max}\right]\right]
X\left(n\right)=\left\{n=0:X_{0},\operatorname{join}\left(\left[X\left(n-1\right)\left[u\left[n\right]\right]\right],\left\{u\left[n\right]=1:\left[\right],X\left(n-1\right)\left[1...u\left[n\right]-1\right]\right\},X\left(n-1\right)\left[u\left[n\right]+1...N\right]\right)\right\}
```

### D18
```
L=616
T\left(l,n\right)=\left\{0\le n<l:1,l\le n<2l:n-l+1,\sum_{k=0}^{l-1}T\left(l,n-l-k\right)\right\}
f\left(l,n,k\right)=\left\{\left\{k=0:1,0\right\}\left\{0\le n<l:1,0\right\}=1:1,\left\{k=0:1,0\right\}\left\{n\ge l:1,0\right\}=1:0,kl>n:0,\sum_{i=0}^{l-1}f\left(l,n-l-i,k-1\right)\right\}
F\left(l,n\right)=\sum_{k=\operatorname{ceil}\left(\frac{n-l+1}{2l-1}\right)}^{\operatorname{floor}\left(\frac{n}{l}\right)}f\left(l,n,k\right)
p_{unif}\left(l,n,k\right)=\frac{f\left(l,n,k\right)}{T\left(l,n\right)}
E\left(l,n,m\right)=\sum_{k=\operatorname{ceil}\left(\frac{n-l+1}{2l-1}\right)}^{\operatorname{floor}\left(\frac{n}{l}\right)}k^{m}p_{unif}\left(l,n,k\right)
V\left(l,n\right)=E\left(l,n,2\right)-E\left(l,n,1\right)^{2}
D\left(l,n\right)=\frac{l}{n}E\left(l,n,1\right)
\left[\left(\frac{l}{n_{0}},D\left(l,n_{0}\right)\right)\operatorname{for}l=\left[1,...,n_{0}\right]\right]
```

### D19
```
R=\prod_{n=1}^{\left[1,...,L\right]}\frac{1}{r\left[n\right]}
V=\prod_{n=1}^{\left[1,...,L\right]}v\left[n\right]
c\left(a,b,t\right)=a\left(\cos\left(2\pi bTt\right),\sin\left(2\pi bTt\right)\right)
C\left(t\right)=\sum_{n=1}^{\left[1,...,L\right]}c\left(R\left[n\right],V\left[n\right],t\right)
C\left(x\right)\left[L\right].x
C\left(x\right)\left[L\right].y
f_{0}\left(p\right)=\left[e^{-p}\frac{p^{n}}{n!}\operatorname{for}n=\left[0,...,N\right]\right]
F_{0}\left(p\right)=\sum_{i=1}^{\left[1,...,N+1\right]}f_{0}\left(p\right)\left[i\right]
G\left(p,x\right)=\operatorname{count}\left(F_{0}\left(p\right)\left[F_{0}\left(p\right)\le x\right]\right)+1
r=\left[G\left(l,\operatorname{random}\left(\right)\right)\operatorname{for}n=\left[1,...,L\right]\right]
v=\left[G\left(m,\operatorname{random}\left(\right)\right)\operatorname{for}n=\left[1,...,L\right]\right]
```
