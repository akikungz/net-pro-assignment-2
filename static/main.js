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

        vlanList.appendChild(tr);
    });
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

    Routes.filter((_, i) => i > 0).forEach(route => {
        const tr = document.createElement('tr');
        Object.keys(route)
            .filter(key => key == 'Code' || key == 'Network' || key == 'Next_Hop' || key == 'Interface')
            .forEach(key => {
                const td = document.createElement('td');
                td.innerHTML = route[key];
                td.classList.add('text-center');
                tr.appendChild(td);
            });

        routeList.appendChild(tr);
    });
}

document.onload = fetchHosts();
