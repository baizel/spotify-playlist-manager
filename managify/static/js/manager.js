const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
const SKIPPED_COLUMNS = 2;
const GENRES_TO_DISPLAY = 1

let numberOfRequests = 0;
let resolvedRequests = 0;
let initTableHTML = undefined
let chosenPlaylists = [];
let storedData = {}
let cachedDataResult;
let nonFilteredValue;
let filterOptions = [];
let allGeneresInCurrentStage;
let isEditMode = false;
let genreFilters = [];

document.addEventListener('DOMContentLoaded', function () {
    initTableHTML = document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML;
    const modalElem = document.querySelectorAll('.modal');
    const modalInstance = M.Modal.init(modalElem, { onCloseEnd: handleFilterChange });
    M.Tabs.init(document.querySelector('.tabs'), {
        onShow: function (tabContent) {
            if (tabContent.id === 'test1') {
                const table = getTableData();
                if (table) table.columns.adjust();
            }
            if (tabContent.id === 'test2') onVisualsTabActivated();
            if (tabContent.id === 'test3') onWheelTabActivated();
        }
    });
    setEditModeCheckbox();
    updateFilterOptions();
    initPlaylistSearch();
    initSpotifySearch();
    if (localStorage.getItem('sidenavCollapsed') === '1') {
        document.getElementById('slide-out').classList.add('sidenav-collapsed');
        document.body.classList.add('sidenav-collapsed');
    }
});

function onVisualsTabActivated() {
    const hasData = storedData && storedData.data && storedData.data.length > 0;
    document.getElementById('visuals-empty').style.display = hasData ? 'none' : 'flex';
    document.getElementById('visuals-content').style.display = hasData ? 'block' : 'none';
    if (hasData && typeof refreshVisuals === 'function') refreshVisuals();
}

function onWheelTabActivated() {
    const hasData = storedData && storedData.data && storedData.data.length > 0;
    document.getElementById('wheel-empty').style.display = hasData ? 'none' : 'flex';
    document.getElementById('wheel-content').style.display = hasData ? 'block' : 'none';
    if (hasData && typeof refreshWheel === 'function') refreshWheel();
}

function initPlaylistSearch() {
    $('#autocomplete-input').on('keyup', function () {
        const searchTerm = this.value.toLowerCase();
        $('.local-playlist').each(function () {
            const playlistName = $(this).find('p').text().toLowerCase();
            if (playlistName.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
}

function toggleSidenav() {
    const isCollapsed = document.getElementById('slide-out').classList.toggle('sidenav-collapsed');
    document.body.classList.toggle('sidenav-collapsed', isCollapsed);
    localStorage.setItem('sidenavCollapsed', isCollapsed ? '1' : '0');
}

let _searchController = null;

function initSpotifySearch() {
    const input = document.getElementById('playlist-search-input');
    if (!input) return;
    input.addEventListener('input', debounce(function () {
        const q = this.value.trim();
        if (!q) { document.getElementById('playlist-search-results').innerHTML = ''; return; }
        if (_searchController) _searchController.abort();
        _searchController = new AbortController();
        fetch(`/api/sp/search?q=${encodeURIComponent(q)}`, { signal: _searchController.signal })
            .then(r => r.json())
            .then(renderSearchResults)
            .catch(err => { if (err.name !== 'AbortError') console.warn('Search failed', err); });
    }, 400));
}

function renderSearchResults(playlists) {
    const container = document.getElementById('playlist-search-results');
    if (!playlists || !playlists.length) {
        container.innerHTML = '<li style="padding:8px 16px;color:#999;font-size:13px">No results</li>';
        return;
    }
    container.innerHTML = playlists.map(pl => {
        const img = (pl.image && pl.image.url) ? pl.image.url : '';
        const name = pl.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<li class="playlist-content" onclick="toggleAndUpdateTable('${pl.id}','${name}','True')">
                    <div id="${pl.id}" class="collection-item avatar valign-wrapper">
                        <img src="${img}" alt="" class="circle">
                        <p>${pl.name}</p>
                    </div>
                </li>`;
    }).join('');
}

function debounce(fn, delay) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

function setEditModeCheckbox() {
    document.getElementById('isEditMode').checked = isEditMode;
}

function onEditMode() {
    const table = getTableData();
    isEditMode = document.getElementById('isEditMode').checked;
    const editableColumns = [];
    for (let i = SKIPPED_COLUMNS; i < storedData.columns.length - filterOptions.length; i++) {
        editableColumns.push(i);
    }
    table.columns(indx => {
        return editableColumns.includes(indx);
    }).visible(isEditMode);
}

function getTableData() {
    return $(prefixHash(SONG_TABLE_ID)).DataTable();
}

function showFilterByGenreOptions() {
    const chipFilter = document.getElementById('genres');
    const chipOptions = Array.from(new Set(storedData.data.map(a => a.topGenre)))
    let html = "";
    chipOptions.forEach(genre => {
        const isClicked = genreFilters.includes(genre) ? "chipClick" : ""
        if (genre) {
            html = html + `<div class="chip ${isClicked}" id="${genre}" onclick="onChipFilter(this)">${genre}</div>`
        }
    })

    chipFilter.innerHTML = html;
}


function onChipFilter(context) {
    let genre = context.id;
    if (!genreFilters.includes(genre)) {
        genreFilters.push(genre);
        context.classList.add("chipClick");
    } else {
        genreFilters = genreFilters.filter(function (chosenGenre) {
            return chosenGenre !== genre;
        })
        context.classList.remove("chipClick");
    }
}

function genreFormatter(data) {
    if (!data || typeof data.entries !== 'function') return [];
    let result = []
    for (const [key,] of data.entries()) {
        result.push(key)
        if (result.length >= GENRES_TO_DISPLAY) {
            break;
        }
    }
    return result;
}

function updateFilterOptions() {
    const checkboxes = document.querySelectorAll('input[name="filterCheckbox"]');

    filterOptions = [{
        title: "genres",
        data: "genres",
        defaultContent: "",
        isDataFormatted: true,
        formatter: genreFormatter,
        visible: true,
        render: function(data, type) {
            if (type !== 'display' || !data || typeof data.entries !== 'function') return '';
            return genreFormatter(data).map(g => `<div class="chip" style="font-size:11px;height:20px;line-height:20px">${g}</div>`).join('');
        }
    }];
    checkboxes.forEach(el => {
        filterOptions.push({ title: el.value, data: el.id, defaultContent: "", visible: true });
    })
}

async function handleFilterChange() {
    showLoader();
    updateFilterOptions();
    updateTable(true).finally(() => {
        hideLoader();
    });
}

async function toggleAndUpdateTable(id, name, isReadOnly) {
    toggleToList({ id, name, isReadOnly });
    toggleNoDataContent()
    updateTable().then(() => {
        if (!(Boolean(storedData.data) && Boolean(storedData.data.length))) {
            deleteTableFromDOM();
        }
    });

}

function hideFilterColumns() {
    let arr = []
    let reducer = (accumulator, currentValue) => {
        accumulator.push(currentValue.value);
        return accumulator
    }
    const checkedValues = new Array(...document.querySelectorAll('input[name="filterCheckbox"]:checked')).reduce(reducer, arr)
    const table = getTableData();
    //Shows columns that are enabled by filter
    //storedData.columns.length - filterOptions.length is to work out how many columns to skip from the first
    table.columns((indx, data, node) => {
        return ((checkedValues.includes(node.innerText) && indx >= storedData.columns.length - filterOptions.length) || node.innerText === "genres");
    }).visible(true);
    //Hides the others
    table.columns((indx, data, node) => {
        return ((!checkedValues.includes(node.innerText) && indx >= storedData.columns.length - filterOptions.length) && node.innerText !== "genres");
    }).visible(false);
}

async function updateTable(forceUseLastFetchedData) {
    return new Promise(async resolve => {
        if (forceUseLastFetchedData && cachedDataResult) {
            storedData = deepCopyHack(cachedDataResult);
        } else {
            storedData = await getPlaylistTracks(chosenPlaylists, "default");
            cachedDataResult = deepCopyHack(storedData);
        }
        // Draw table immediately with whatever data we have (no features yet)
        nonFilteredValue = deepCopyHack(storedData);
        showFilterByGenreOptions();
        applyGenreFilter();
        drawTable(() => {
            setEditModeCheckbox();
            onEditMode();
            hideFilterColumns();
            resolve();
        });
        // Load features and artist data async — fills in feature columns + genres after table is visible
        loadSecondaryDataAsync();
    });
}

async function loadSecondaryDataAsync() {
    if (!storedData || !storedData.data || !storedData.data.length) return;

    const trackIds = storedData.data.map(s => s.id);
    const artistIds = [...new Set(storedData.data.flatMap(s => (s.artists || []).map(a => a.id)))];

    // Fetch features (with localStorage cache) and artist data in parallel
    const [featureMap, artistMap] = await Promise.all([
        fetchAndCacheFeatures(trackIds),
        artistIds.length ? fetchArtists(artistIds) : Promise.resolve({})
    ]);

    // Merge features into track data
    storedData.data.forEach(song => {
        const f = featureMap[song.id];
        if (f) Object.assign(song, f);
    });

    // Merge artist data and rebuild genres
    if (Object.keys(artistMap).length) {
        storedData.artists = artistMap;
        allGeneresInCurrentStage = buildGenres();
        nonFilteredValue = deepCopyHack(storedData);
        showFilterByGenreOptions();
        applyGenreFilter();
    }

    cachedDataResult = deepCopyHack(storedData);

    // Refresh table rows in-place to show feature values
    const table = getTableData();
    if (table) {
        table.rows().invalidate().draw(false);
        hideFilterColumns();
    }

    // Notify visuals + wheel tabs if active
    if (typeof refreshVisuals === 'function') refreshVisuals();
    if (typeof refreshWheel === 'function') refreshWheel();
}

async function fetchArtists(artistIds) {
    try {
        const resp = await fetch('/api/sp/artists', {
            method: 'POST',
            body: JSON.stringify(artistIds)
        });
        if (!resp.ok) return {};
        return await resp.json();
    } catch (e) {
        console.warn('Artist fetch failed', e);
        return {};
    }
}

function applyGenreFilter() {
    if (genreFilters.length) {
        storedData.data = nonFilteredValue.data.filter(x => genreFilters.includes(x.topGenre));
    } else {
        storedData.data = deepCopyHack(nonFilteredValue.data);
    }
}

function buildGenres() {
    let allGenreCount = {}
    storedData.data.forEach(songInfo => {
        let songGenres = {}
        songInfo.artists.forEach(artist => {
            let artistId = artist.id
            const artistData = storedData.artists[artistId];
            if (!artistData) return; // artist not yet loaded (fast path)
            artistData.genres.forEach((genre => {
                allGenreCount[genre] = allGenreCount[genre] !== undefined ? allGenreCount[genre] + 1 : 1;
                songGenres[genre] = songGenres[genre] !== undefined ? songGenres[genre] + 1 : 1;
            }))
        })
        const entries = Object.entries(songGenres).sort(([, a], [, b]) => b - a);
        if (entries[0]) {
            songInfo['topGenre'] = entries[0][0];
        }

        songInfo['genres'] = new Map(entries);

    });
    return allGenreCount
}

function drawTable(onDraw) {
    function draw(setting) {
        setReadOnlyCheckBoxes();
        const func = onDraw || $.noop;
        func(setting);
    }

    const options = {
        // "dom": 'Blfrtir',
        "ordering": true,
        "order": [],
        "paging": true,
        "pageLength": 50,
        "lengthMenu": [[25, 50, 100, -1], [25, 50, 100, "All"]],
        "createdRow": function (row, data, index) {
            const imageUrl = getImageUrl(data).url;
            const songName = data.Song;
            formatSongColumn(row, 0, { imageUrl, songName });
            for (let i = SKIPPED_COLUMNS; i < storedData.columns.length - filterOptions.length; i++) {
                let payload = {
                    songId: data.id,
                    playlistId: storedData.columns[i].id
                };
                formatCheckboxColumns(row, i, payload, Boolean(data[storedData.columns[i].data]));
            }
            for (let i = storedData.columns.length - filterOptions.length; i < storedData.columns.length; i++) {
                formatFilterOptions(row, i, data[storedData.columns[i].data]);
            }
        },
        "rowCallback": function (row, data, displayNum, displayIndex, dataIndex) {
            const imageUrl = getImageUrl(data).url;
            formatSongColumn(row, 0, { imageUrl, songName: data.Song });
        },
        "drawCallback": draw,
        language: {
            searchPlaceholder: "Search Songs"
        }
        // scrollY: (getPageHeight() - 350) + "px",
        // scrollX: true,
        // scrollCollapse: true,
        // fixedColumns: true
    }

    // deleteTableFromDOM();
    // const existingColumns = new Set(JSON.parse(JSON.stringify(storedData.columns)));
    // new Set(JSON.parse(JSON.stringify(filterOptions))).forEach((item) => existingColumns.add(item));
    // storedData.columns = JSON.parse(JSON.stringify([...existingColumns]));
    // const optionWithData = Object.assign(options, storedData);
    // const table = $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    // Strip any filterOption columns already in storedData.columns (from a previous draw)
    const filterDataKeys = new Set(filterOptions.map(f => f.data));
    storedData.columns = storedData.columns.filter(c => !filterDataKeys.has(c.data));
    const optionWithData = Object.assign(options, storedData);
    optionWithData.columns.push(...filterOptions);
    deleteTableFromDOM()
    const table = $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    $(`${prefixHash(SONG_TABLE_ID)} tbody`).on('click', 'tr', function (element) {
        if (!($(element.target).is("input") || $(element.target).hasClass("playlistCheckBox"))) {
            onClickRow(this, table);
        }
    });
}

function deleteTableFromDOM() {
    //clear old data table
    if ($.fn.DataTable.isDataTable(prefixHash(SONG_TABLE_ID))) {
        const dtApi = getTableData();
        dtApi.destroy();
        document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML = initTableHTML;
    }
}

function formatSongColumn(row, columnIndex, { imageUrl, songName }) {
    const imgHTML = `<div class="valign-wrapper">
                        <img src="${imageUrl}" alt="album art" class="circle" height="32">
                        <span class="song-name">${songName}</span>
                    </div>`
    $(`td:eq(${columnIndex})`, row).html(imgHTML);
}

function formatFilterOptions(row, columnIndex, data) {
    let html = data;
    if (storedData.columns[columnIndex].isDataFormatted) {
        const formattedData = storedData.columns[columnIndex].formatter(data)
        html = "";
        formattedData.forEach(genre => {
            html = html + `<div class="chip">${genre}</div>`
        })
    }
    $(`td:eq(${columnIndex})`, row).html(html);
}

function formatCheckboxColumns(row, columnIndex, payload, isChecked) {
    const isCheckedAttr = isChecked ? "checked" : "";
    const pld = JSON.stringify(payload);
    const checkbox = `<label>
                        <input class="${payload.playlistId}" type="checkbox" ${isCheckedAttr} onclick='handleCheckbox(this, ${pld})'>
                        <span class="playlistCheckBox"></span>
                  </label>`
    $(`td:eq(${columnIndex})`, row).html(checkbox);
}

function handleCheckbox(target, payload) {
    payload["isAdd"] = target.checked
    console.log(JSON.stringify(payload))
    fetch("/api/sp/editPlaylist", { method: 'post', body: JSON.stringify(payload) })
        .then((response) => {
            return response.json()
        }).catch(reason => {
            target.checked = !target.checked;
            toast(`Failed getting editing playlist - ${reason}. Try again! `)
        });
}

async function getPlaylistTracks(playlists, cachePolicy) {
    const cache = cachePolicy ? cachePolicy : "default";
    numberOfRequests++;
    handleSpinnerState();
    return fetch(`api/sp/playlist/fast`, { method: 'post', body: JSON.stringify(playlists), cache: cache })
        .then((response) => {
            return response.json()
        }).finally((() => {
            resolvedRequests++
            handleSpinnerState();
        })).catch(reason => {
            toast(`Failed getting tracks - ${reason}. Try again! `)
        });

}

function toggleToList(playlist) {
    const isPlaylistAlreadyChosen = chosenPlaylists.some(plst => plst.id === playlist.id)
    const el = document.getElementById(playlist.id);
    if (isPlaylistAlreadyChosen) {
        chosenPlaylists = chosenPlaylists.filter(function (el) {
            return el.id !== playlist.id;
        })
        if (el) el.classList.remove("added-playlist");
    } else {
        chosenPlaylists.push(playlist)
        if (el) el.classList.add("added-playlist");
    }
}

function toggleNoDataContent() {
    if (chosenPlaylists.length > 0) {
        document.getElementsByClassName("nodata")[0].style.display = 'none';
        document.getElementById('tableContainer').style.display = 'block';
    } else {
        document.getElementsByClassName("nodata")[0].style.display = 'block';
        document.getElementById('tableContainer').style.display = 'none';
    }
}

function prefixHash(val) {
    return '#' + val;
}

function removeClickClass(table) {
    table.rows().every(function () {
        this.nodes().to$().removeClass('rowClick')
    })
}

function onClickRow(context, table) {
    const song = table.row(context).data()
    const tableData = getAppliedData(table);
    playSong(song, tableData) //Should be imported from the other file
    removeClickClass(table);
    applyRowClick(table.row(context).nodes().to$());
}

function handleSpinnerState() {
    showLoader();
    if (resolvedRequests === numberOfRequests) {
        hideLoader();
    }
}

function getAppliedData(table) {
    return table.rows({ order: 'applied' }).data().toArray();
}

function getIndexedData(table) {
    return table.rows({ order: 'index' }).data().toArray();
}

function getPageHeight() {
    const body = document.body, html = document.documentElement;
    return Math.max(body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight);
}

function showLoader() {
    document.getElementById("data-loader").style.visibility = "visible";
}

function hideLoader() {
    document.getElementById("data-loader").style.visibility = "hidden";
}

function toggleTableSearch() {
    const wrapper = document.querySelector('.hiddensearch');
    if (!wrapper) return;
    const isHidden = wrapper.style.display === 'none' || wrapper.style.display === '';
    wrapper.style.display = isHidden ? 'block' : 'none';
    if (isHidden) wrapper.querySelector('input')?.focus();
}

function setReadOnlyCheckBoxes() {
    chosenPlaylists.filter(playlist => JSON.parse(playlist.isReadOnly.toLocaleLowerCase())).forEach((playlist) => {
        let checkboxes = document.getElementsByClassName(playlist.id)
        Array.from(checkboxes).forEach((item) => {
            item.disabled = true;
            if (!item.checked) {
                item.indeterminate = true
            }
        });
    })
}

function updateTableSelection(uri) {
    const table = getTableData();
    const tableData = getIndexedData(table);
    const indexOfRow = tableData.findIndex(x => x.uri === uri);
    if (indexOfRow >= 0) {
        removeClickClass(table);
        applyRowClick(table.rows(indexOfRow).nodes().to$());
    }
}

function applyRowClick($clickedRow) {
    const hasClass = $clickedRow.hasClass('rowClick');
    if (hasClass) {
        $clickedRow.removeClass('rowClick')
    } else {
        $clickedRow.addClass('rowClick')
    }
}

function deepCopyHack(data) {
    return JSON.parse(JSON.stringify(data, replacer), receiver);
}

function replacer(key, value) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

function receiver(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}

function toast(mssg) {
    M.toast({ html: mssg })
}