document.addEventListener('DOMContentLoaded', function () {
    let elems = document.querySelectorAll('.sidenav');
    let collapsible = document.querySelectorAll('.collapsible');
    let sideNavInstance = M.Sidenav.init(elems, {});
    let collapInstance = M.Collapsible.init(collapsible, {});
    sideNavInstance.isFixed = true;
});
