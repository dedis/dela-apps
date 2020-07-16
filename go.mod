module go.dedis.ch/dela-apps

go 1.14

require (
	github.com/stretchr/testify v1.6.1
	go.dedis.ch/dela v0.0.0-20200709062217-e8eee0ecc49c
	go.dedis.ch/kyber/v3 v3.0.12
	golang.org/x/tools v0.0.0-20191130070609-6e064ea0cf2d
	golang.org/x/xerrors v0.0.0-20191204190536-9bdfabe68543
)

// need PR #76 to be removed
replace go.dedis.ch/dela => /Users/nkocher/GitHub/dela
