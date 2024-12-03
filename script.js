// Set up SVG
const svg = d3.select("#network");
const width = svg.node().parentElement.clientWidth;
const height = svg.node().parentElement.clientHeight;

// Create a container group for zoom behavior
const container = svg.append("g")
    .attr("class", "container");

svg.attr("width", width)
   .attr("height", height);

// Add zoom behavior
const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on("zoom", (event) => {
        container.attr("transform", event.transform);
    });

svg.call(zoom);

// Create drag behavior
const drag = d3.drag()
    .on("start", dragStarted)
    .on("drag", dragging)
    .on("end", dragEnded);

function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = event.x;
    d.fy = event.y;
}

function dragging(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// Color scale for countries
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

// Process data
function processData(data) {
    // Filter out records with missing data
    const filteredData = data.filter(d => d.Year && d.Authors && d["Authors with affiliations"]);
    
    const authorMap = new Map();
    const links = [];

    // Process each publication
    filteredData.forEach(paper => {
        const authors = paper.Authors.split(',').map(a => a.trim());
        const authorIds = paper["Author(s) ID"].split(';').map(id => id.trim());
        const affiliations = paper["Authors with affiliations"].split(';');
        
        // Create or update nodes
        authors.forEach((author, idx) => {
            if (authorIds[idx] && affiliations[idx]) {
                const id = authorIds[idx];
                const affInfo = affiliations[idx].split(',');
                const country = affInfo[affInfo.length - 1].trim();
                
                if (!authorMap.has(id)) {
                    authorMap.set(id, {
                        id: id,
                        author: author,
                        affiliation: affiliations[idx],
                        country: country,
                        papers: new Set([paper.Title]),
                    });
                } else {
                    authorMap.get(id).papers.add(paper.Title);
                }
            }
        });

        // Create collaboration links
        for (let i = 0; i < authors.length; i++) {
            for (let j = i + 1; j < authors.length; j++) {
                if (authorIds[i] && authorIds[j]) {
                    links.push({
                        source: authorIds[i],
                        target: authorIds[j],
                        publication: paper.Title
                    });
                }
            }
        }
    });

    // Convert to array and calculate degrees
    const nodes = Array.from(authorMap.values()).map(author => ({
        ...author,
        degrees: author.papers.size
    }));

    // Get top 10 countries
    const countryCounts = {};
    nodes.forEach(node => {
        countryCounts[node.country] = (countryCounts[node.country] || 0) + 1;
    });
    
    const top10Countries = Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(d => d[0]);

    return { nodes, links, top10Countries, countryCounts };
}

// Create force simulation
const simulation = d3.forceSimulation()
    .force("link", d3.forceLink()
        .id(d => d.id)
        .distance(50)
        .strength(1))
    .force("charge", d3.forceManyBody()
        .strength(-30))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(20));

// Load and visualize data
d3.csv("data/publications.csv").then(data => {
    const { nodes, links, top10Countries, countryCounts } = processData(data);

    // Create node size scale
    const nodeScale = d3.scaleSqrt()
        .domain([0, d3.max(nodes, d => d.degrees)])
        .range([3, 12]);

    // Create the links
    const link = container.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link");

    // Create the nodes
    const node = container.append("g")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("class", "node")
        .attr("r", d => nodeScale(d.degrees))
        .attr("fill", d => top10Countries.includes(d.country) ? 
            colorScale(d.country) : "#A9A9A9")
        .call(drag);

    // Add hover interactions
    node.on("mouseover", function(event, d) {
        // Highlight same country
        node.style("opacity", n => 
            n.country === d.country ? 1 : 0.2
        );
        link.style("opacity", l => 
            l.source.country === d.country || l.target.country === d.country ? 0.6 : 0.1
        );
    })
    .on("mouseout", function() {
        node.style("opacity", 1);
        link.style("opacity", 0.6);
    });

    // Add click interactions for tooltip
    node.on("click", function(event, d) {
        d3.select("#tooltip")
            .style("opacity", 1)
            .html(`
                <strong>Author:</strong> ${d.author}<br>
                <strong>Affiliation:</strong> ${d.affiliation}<br>
                <strong>Papers:</strong> ${d.papers.size}<br>
                <strong>Country:</strong> ${d.country}
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
    });

    // Click outside to hide tooltip
    d3.select("body").on("click", function(event) {
        if (event.target.tagName !== "circle") {
            d3.select("#tooltip").style("opacity", 0);
        }
    });

    // Update force simulation
    simulation
        .nodes(nodes)
        .force("link").links(links);

    // Add tick function
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    });

    // Add force parameter controls
    d3.select("#chargeStrength").on("input", function() {
        const value = +this.value;
        d3.select("#chargeValue").text(value);
        simulation.force("charge").strength(value);
        simulation.alpha(1).restart();
    });

    d3.select("#linkStrength").on("input", function() {
        const value = +this.value;
        d3.select("#linkValue").text(value);
        simulation.force("link").strength(value);
        simulation.alpha(1).restart();
    });

    d3.select("#collideRadius").on("input", function() {
        const value = +this.value;
        d3.select("#collideValue").text(value);
        simulation.force("collide").radius(value);
        simulation.alpha(1).restart();
    });

    // Update statistics
    d3.select("#totalAuthors").text(nodes.length);
    d3.select("#totalLinks").text(links.length);

    // Create country legend
    const legend = d3.select("#countryLegend");
    top10Countries.forEach(country => {
        legend.append("div")
            .attr("class", "legend-item")
            .html(`
                <div class="legend-color" style="background: ${colorScale(country)}"></div>
                <div>${country} (${countryCounts[country]})</div>
            `);
    });
    
    // Add "Others" to legend
    const otherCount = nodes.length - top10Countries.reduce((acc, country) => 
        acc + countryCounts[country], 0);
    legend.append("div")
        .attr("class", "legend-item")
        .html(`
            <div class="legend-color" style="background: #A9A9A9"></div>
            <div>Others (${otherCount})</div>
        `);

}).catch(error => {
    console.error("Error loading data:", error);
});