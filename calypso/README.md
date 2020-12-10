```
# start node 1 and 2
go install && LLVL=info memcoin --config /tmp/node1 start --port 2001
LLVL=info memcoin --config /tmp/node2 start --port 2002

# share the address between the two nodes
memcoin --config /tmp/node2 minogrpc join --address 127.0.0.1:2001 $(memcoin --config /tmp/node1 minogrpc token)


# start the proxy server
memcoin --config /tmp/node1 proxy start --clientaddr 127.0.0.1:8081    

# start DKG on each node
memcoin --config /tmp/node1 calypso listen
memcoin --config /tmp/node2 calypso listen

# register the GUI handlers on node 1
memcoin --config /tmp/node1 calypso register

# setup DKG
memcoin --config /tmp/node1 calypso setup --pubkeys 486278384128ad175090d08fc3e98e4f8eb2b9d032b5d4648189eaf3bbfad601,9a23f874a73130b8e6ae747d0c03c0d0dd934b47538cdc69aec5373f30d04daf --addrs RjEyNy4wLjAuMToyMDAx,RjEyNy4wLjAuMToyMDAy --threshold 2
```