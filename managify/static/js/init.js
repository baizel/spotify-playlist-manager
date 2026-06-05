document.addEventListener('DOMContentLoaded', function () {
    let elems = document.querySelectorAll('.sidenav');
    let collapsible = document.querySelectorAll('.collapsible');
    let sideNavInstance = M.Sidenav.init(elems, {});
    let collapInstance = M.Collapsible.init(collapsible, {});
    sideNavInstance.isFixed = true;
    console.log('init');
});

function getImageUrl(songInfo) {
    if (songInfo.album && songInfo.album.images && songInfo.album.images.length)
        return songInfo.album.images.reduce(function (prev, curr) {
            return prev.height < curr.height ? prev : curr;
        });
    return { url: "" };
}