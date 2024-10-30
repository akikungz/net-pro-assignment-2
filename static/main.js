const hosts = [];
let selectedHost = null;

const ips = [];
const vlans = [];
const routes = [];

function fetchHosts() {
    fetch('/api/hosts')
        .then(response => response.json())
        .then(response => {
            // clear hosts
            hosts.splice(0, hosts.length);
            // add new hosts
            hosts.push(...response.data);
        })
        .then(renderHosts);
}

function fetchIps(host) {
    // Clear ips
    ips.splice(0, ips.length);
    fetch(`/api/${host}/ips`)
        .then(response => response.json())
        .then(response => {
            // clear ips
            ips.splice(0, ips.length);

            const data = response.data.map(line => {
                const [int, ip, _, __, status, protocol] = line.split(/\s+/);
                return { int, ip, status: status == "administratively" ? "administratively down" : status, protocol }
            })

            console.log(data)

            ips.push(...data);
        })
        .then(renderIps);
}

function fetchVlans(host) {
    // Clear vlans
    vlans.splice(0, vlans.length);
    fetch(`/api/${host}/vlans`)
        .then(response => response.json())
        .then(response => {
            // clear vlans
            vlans.splice(0, vlans.length);
            const text = response.data;
            const lines = text.trim().split('\n');
            const header = lines[0].split(/\s{2,}/); // Split by two or more spaces

            for (let i = 2; i < lines.length; i++) { // Start after the header and separator lines
                const columns = lines[i].trim().split(/\s{2,}/);
                const vlanEntry = {
                    VLAN_ID: parseInt(columns[0]),
                    VLAN_Name: columns[1],
                    Status: columns[2],
                    Ports: columns.length > 3 ? columns[3].split(', ').map(port => port.trim()).join(', ') : null
                };

                vlans.push(vlanEntry);
            }
        })
        .then(renderVlans)
        .catch(() => {
            const vlanList = document.getElementById('vlan-list');
            vlanList.innerHTML = '';
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            // td colspan 4
            td.colSpan = 4;
            td.innerHTML = 'No VLANs found';
            td.classList.add('text-center');
            tr.appendChild(td);
            vlanList.appendChild(tr);
        })
}

function fetchRoutes(host) {
    // Clear routes
    fetch(`/api/${host}/routes`)
        .then(response => response.json())
        .then(response => {
            // clear routes
            routes.splice(0, routes.length);
            routes.push(response.data);
        })
        .then(renderRoutes)
}

function selectHost(host) {
    selectedHost = host;
    fetchIps(host);
    fetchVlans(host);
    fetchRoutes(host);
    console.log(selectedHost);
}

function renderHosts() {
    const hostList = document.getElementById('host-list');
    hostList.innerHTML = '';
    hosts.forEach(host => {
        const div = document.createElement('div');
        div.innerHTML = host;
        div.onclick = () => selectHost(host);
        div.classList.add('w-full', 'p-2', 'cursor-pointer', 'hover:bg-gray-200', 'rounded');
        hostList.appendChild(div);
    });

    const ipSelect = document.getElementById('ip');
    hosts.forEach(host => {
        const option = document.createElement('option');
        option.value = host;
        option.innerHTML = host;
        ipSelect.appendChild(option);
    });
}

function renderIps() {
    const ipList = document.getElementById('ip-list');
    ipList.innerHTML = '';
    ips.forEach(ip => {
        const tr = document.createElement('tr');
        Object.keys(ip).forEach(key => {
            const td = document.createElement('td');
            td.innerHTML = ip[key];
            td.classList.add('text-center');
            tr.appendChild(td);
        });

        const editButton = document.createElement('button');
        editButton.innerHTML = 'Edit';
        editButton.classList.add('btn', 'btn-primary', 'mx-2');
        editButton.onclick = () => {
            const newIp = prompt('Enter new IP address:', ip.ip);
            const newMask = prompt('Enter new subnet mask:', ip.mask);
            if (newIp && newMask) {
                fetch(`/api/${selectedHost}/ips/${ip.int.replace('/', 'p')}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ip: newIp, mask: newMask })
                })
                    .then(() => fetchIps(selectedHost))
                    .catch(console.error);
            }
        }

        tr.appendChild(editButton);

        ipList.appendChild(tr);
    });
}

function renderVlans() {
    const vlanList = document.getElementById('vlan-list');
    vlanList.innerHTML = '';
    console.log(vlans);
    vlans.forEach(vlan => {
        const tr = document.createElement('tr');
        Object.keys(vlan).forEach(key => {
            const td = document.createElement('td');
            td.innerHTML = vlan[key];
            td.classList.add('text-center');
            tr.appendChild(td);
        });

        const editButton = document.createElement('button');
        editButton.innerHTML = 'Edit';
        editButton.classList.add('btn', 'btn-primary', 'mx-2');

        editButton.onclick = () => {
            const newVlanName = prompt('Enter new VLAN name:', vlan.VLAN_Name);
            if (newVlanName) {
                fetch(`/api/${selectedHost}/vlans`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: newVlanName, id: vlan.VLAN_ID })
                })
                    .then(() => fetchVlans(selectedHost))
                    .catch(console.error);
            }
        }

        vlanList.appendChild(tr);
    });

    const vlanElement = document.getElementById('vlans');
    if (document.getElementById('add-vlan-button')) return;
    const addVlanButton = document.createElement('button');
    addVlanButton.innerHTML = 'Add VLAN';
    addVlanButton.id = 'add-vlan-button';
    addVlanButton.classList.add('btn', 'btn-primary', 'mx-2');
    addVlanButton.onclick = () => {
        const vlanId = prompt('Enter VLAN ID:');
        const vlanName = prompt('Enter VLAN name:');
        if (vlanName) {
            fetch(`/api/${selectedHost}/vlans`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: vlanName, id: vlanId })
            })
                .then(() => fetchVlans(selectedHost))
                .catch(console.error);
        }
    }

    vlanElement.appendChild(addVlanButton);
}

function parseRoutingTableToJson(text) {
    const lines = text.trim().split('\n');
    let gatewayOfLastResort = '';
    const routes = [];

    for (const line of lines) {
        // Check for gateway of last resort
        if (line.includes("Gateway of last resort")) {
            gatewayOfLastResort = line.split('is ')[1].split(' to ')[0].trim();
            continue;
        }
        
        // Ignore the first few lines that are not routing entries
        if (line.startsWith("Codes:") || line.startsWith("Gateway of last resort")) {
            continue;
        }

        const routeMatch = line.match(/(\S+)\s+(\S+)\s+\[(\d+)\/(\d+)\]\s+via\s+(\S+)/);
        if (routeMatch) {
            const [_, code, network, adminDistance, metric, nextHop] = routeMatch;
            routes.push({
                Code: code,
                Network: network,
                Admin_Distance: parseInt(adminDistance),
                Metric: parseInt(metric),
                Next_Hop: nextHop
            });
        } else {
            // Match for connected routes
            const connectedMatch = line.match(/(\S+)\s+(\S+)\s+is\s+directly\s+connected,\s+(\S+)/);
            if (connectedMatch) {
                const [_, code, network, interface] = connectedMatch;
                routes.push({
                    Code: code,
                    Network: network,
                    Admin_Distance: null,
                    Metric: null,
                    Interface: interface
                });
            }
        }
    }

    return {
        GatewayOfLastResort: gatewayOfLastResort,
        Routes: routes
    };
}

function renderRoutes() {
    const routeList = document.getElementById('route-list');
    routeList.innerHTML = '';
    const { GatewayOfLastResort, Routes } = parseRoutingTableToJson(routes[0]);

    console.log(Routes, GatewayOfLastResort);

    Routes.forEach(route => {
        const tr = document.createElement('tr');
        const key = Object.keys(route)
            .filter(key => key == 'Code' || key == 'Network' || key == 'Next_Hop' || key == 'Interface')
            .map(key => {
                const td = document.createElement('td');
                td.innerHTML = route[key];
                td.classList.add('text-center');
                tr.appendChild(td);

                return key;
            });

        if (!['C', 'L'].includes(route.Code)) {
            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = 'Delete';
            deleteButton.classList.add('btn', 'btn-danger', 'mx-2');

            network = route.Network;

            network = network.split('/');

            deleteButton.onclick = () => {
                const data = { 
                    network: network[0], 
                    mask: getSubnetMask(route.Network), 
                    nextHop: route.Next_Hop 
                }

                console.log(data);
                fetch(`/api/${selectedHost}/routes`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                    .then(() => fetchRoutes(selectedHost))
                    .catch(console.error);
            }

            tr.appendChild(deleteButton);
        }

        routeList.appendChild(tr);
    });

    const routeElement = document.getElementById('routes');
    if (document.getElementById('add-route-button')) return;

    const addRouteButton = document.createElement('button');
    addRouteButton.innerHTML = 'Add Route';
    addRouteButton.id = 'add-route-button';
    addRouteButton.classList.add('btn', 'btn-primary', 'mx-2');
    addRouteButton.onclick = () => {
        const network = prompt('Enter network:');
        const mask = prompt('Enter mask:');
        const nextHop = prompt('Enter next hop:');
        if (network && mask && nextHop) {
            fetch(`/api/${selectedHost}/routes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ network, mask, nextHop })
            })
                .then(() => fetchRoutes(selectedHost))
                .catch(console.error);
        }
    }

    routeElement.appendChild(addRouteButton);
}

function getSubnetMask(subnet) {
    const number = parseInt(subnet.split('/')[1]);
    let mask = '';

    if (isNaN(number)) return null;

    if (number > 32) return null;

    // convert number to binary
    for (let i = 0; i < 32; i++) {
        if (i < number) {
            mask += '1';
        } else {
            mask += '0';
        }
    }

    const octets = [];
    for (let i = 0; i < 4; i++) {
        octets.push(parseInt(mask.slice(i * 8, (i + 1) * 8), 2));
    }

    return octets.join('.');
}

document.onload = fetchHosts();
