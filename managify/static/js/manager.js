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
let isEditMode = true; //TODO: add this feature
let genreFilters = [];

document.addEventListener('DOMContentLoaded', function () {
    initTableHTML = document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML;
    const modalElem = document.querySelectorAll('.modal');
    const modalInstance = M.Modal.init(modalElem, {onCloseEnd: handleFilterChange});
    setEditModeCheckbox();
    updateFilterOptions();
});

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
    const checkboxes = document.querySelectorAll('input[name="filterCheckbox"]:checked');

    filterOptions = [{title: "genres", data: "genres", isDataFormatted: true, formatter: genreFormatter}];
    Array.prototype.forEach.call(checkboxes, function (el) {
        filterOptions.push({title: el.value, data: el.id});
    });
}

async function handleFilterChange() {
    // showLoader();
    updateFilterOptions();
    // drawTable(() => hideLoader());
    //TODO: this is bad, should load all filters columns and set visibility instead
    await updateTable(true);
}

async function toggleAndUpdateTable(id, name, isReadOnly) {
    toggleToList({id, name, isReadOnly});
    toggleNoDataContent()
    await updateTable().then(() => {
        if (!(Boolean(storedData.data) && Boolean(storedData.data.length))) {
            deleteTableFromDOM();
        }
    });

}

async function updateTable(forceUseLastFetchedData) {
    if (forceUseLastFetchedData && cachedDataResult) {
        storedData = deepCopyHack(cachedDataResult);
    } else {
        storedData = await getPlaylistTracks(chosenPlaylists, "default");
        cachedDataResult = deepCopyHack(storedData);
    }
    allGeneresInCurrentStage = buildGenres(); // BuildGeneres mutates storedData atm :/ TODO: change this
    nonFilteredValue = deepCopyHack(storedData);
    showFilterByGenreOptions();
    applyGenreFilter()
    drawTable(() => {
        initSearchBar();
        setEditModeCheckbox();
    });
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
            storedData.artists[artistId].genres.forEach((genre => {
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
        "paging": false,
        "createdRow": function (row, data, index) {
            const id = data.id;
            const imageUrl = getImageUrl(data).url;
            const songName = data.Song;
            formatSongColumn(row, 0, {imageUrl, songName});
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
    const optionWithData = Object.assign(options, storedData)
    optionWithData.columns.push(...filterOptions)
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

function formatSongColumn(row, columnIndex, {imageUrl, songName}) {
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
    console.log("To do api request to add and remove from playlist");
    console.log(target.checked);
    console.log(payload.songId);
}

async function getPlaylistTracks(playlists, cachePolicy) {
    const cache = cachePolicy ? cachePolicy : "default";
    numberOfRequests++;
    handleSpinnerState();
    return fetch(`api/sp/playlist`, {method: 'post', body: JSON.stringify(playlists), cache: cache})
        .then((response) => {
            return response.json()
        }).finally((() => {
            resolvedRequests++
            handleSpinnerState();
        }));

}

function toggleToList(playlist) {
    const isPlaylistAlreadyChosen = chosenPlaylists.some(plst => plst.id === playlist.id)
    if (isPlaylistAlreadyChosen) {
        chosenPlaylists = chosenPlaylists.filter(function (el) {
            return el.id !== playlist.id;
        })
        document.getElementById(playlist.id).classList.remove("added-playlist");
    } else {
        chosenPlaylists.push(playlist)
        document.getElementById(playlist.id).classList.add("added-playlist");
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
    return table.rows({order: 'applied'}).data().toArray();
}

function getIndexedData(table) {
    return table.rows({order: 'index'}).data().toArray();
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

function initSearchBar() {
    $('.search-toggle').click(function () {
        if ($('.hiddensearch').css('display') === 'none')
            $('.hiddensearch').slideDown();
        else
            $('.hiddensearch').slideUp();
    });
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