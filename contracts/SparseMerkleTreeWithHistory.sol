// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPoseidon {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256);
}

contract SparseMerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant ZERO_VALUE = 0; // Default leaf value
    IPoseidon public immutable poseidon;
    uint32 public immutable levels;
    uint32 public immutable MAX_LEAVES; // Maximum number of leaves

    uint256 public root; // Current Merkle root
    uint32 public nextIndex; // Next available leaf index
    mapping(uint256 => mapping(uint256 => uint256)) public filledSubtrees; // Mapping of filled subtrees, tree level -> subtree index (0 left, 1 right) -> subtree value
    mapping(uint256 => uint256) public leaves; // Mapping of filled non-zero leaves
    mapping(uint256 => bool) public historicalRoots; // Mapping of historical roots

    event RootUpdated(uint256 indexed oldRoot, uint256 indexed newRoot, uint32 leafIndex, uint256 leafValue);

    // Errors
    error TreeFull();
    error LeafIndexOutOfBounds();
    error LevelIndexOutOfBounds();

    constructor(uint32 _levels, address _poseidonContract) {
        require(_levels > 0 && _levels < 32, "Invalid tree depth");
        levels = _levels;
        poseidon = IPoseidon(_poseidonContract);
        nextIndex = 0;
        MAX_LEAVES = uint32(2 ** levels);

        // Initialize zero values for empty leaves
        root = zeros(_levels);
    }

    /**
     * @dev Inserts a new leaf into the Merkle tree.
     * @param _leaf The value of the new leaf.
     * @return index The index of the inserted leaf.
     */
    function _insertLeaf(uint256 _leaf) internal returns (uint32 index) {
        uint32 currentIndex = nextIndex;
        uint256 currentLevelHash = _leaf;
        uint256 left;
        uint256 right;

        // Insert the leaf into the next available index
        leaves[nextIndex] = _leaf;

        // Update the tree from the bottom up
        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                // Left child: Update the left sibling and fallback to zero if there is no right sibling
                left = currentLevelHash;
                right = filledSubtrees[i][1] == 0 ? zeros(i) : filledSubtrees[i][1];
                filledSubtrees[i][0] = currentLevelHash; // Update left sibling
            } else {
                // Right child: Use the most recent left sibling and update the right sibling
                left = filledSubtrees[i][0];
                right = currentLevelHash;
                filledSubtrees[i][1] = currentLevelHash; // Update right sibling
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }

        // Update the root and store the previous root
        historicalRoots[root] = true;
        uint32 insertedIndex = nextIndex;
        emit RootUpdated(root, currentLevelHash, insertedIndex, _leaf);
        root = currentLevelHash;
        nextIndex = nextIndex + 1 >= MAX_LEAVES ? 0 : nextIndex + 1;
        return insertedIndex; // Return the index of the new leaf
    }

    /**
     * @dev Computes the Merkle root given a leaf and proof.
     * @param _leaf The leaf value.
     * @param pathElements The path elements.
     * @param pathIndices The path indices.
     * @return The computed root.
     */
    function computeRoot(uint256 _leaf, uint256[] calldata pathElements, uint256[] calldata pathIndices) external view returns (uint256) {
        uint256 currentHash = _leaf;
        for (uint256 i = 0; i < pathElements.length; i++) {
            uint256 siblingHash = pathElements[i];
            if (pathIndices[i] == 0) {
                currentHash = hashLeftRight(currentHash, siblingHash);
            } else {
                currentHash = hashLeftRight(siblingHash, currentHash);
            }
        }
        return currentHash;
    }

    /**
     * @dev Hashes two inputs using Poseidon.
     * @param left Left input.
     * @param right Right input.
     * @return The Poseidon hash of the inputs.
     */
    function hashLeftRight(uint256 left, uint256 right) public view returns (uint256) {
        require(uint256(left) < FIELD_SIZE && uint256(right) < FIELD_SIZE, "Inputs exceed field size");
        return poseidon.poseidon([left, right]);
    }

    /**
     * @dev Computes the default root for a tree of a given depth.
     * @param depth The tree depth.
     * @param defaultLeaf The default leaf value.
     * @return The root of a fully empty tree.
     // TODO: use the precomputed zeros function instead of this
     */
    function computeDefaultRoot(uint256 depth, uint256 defaultLeaf) public view returns (uint256) {
        uint256 currentHash = defaultLeaf;
        for (uint256 i = 0; i < depth; i++) {
            currentHash = hashLeftRight(currentHash, currentHash);
        }
        return currentHash;
    }

    /**
     * @dev Precomputed empty tree values for a given level.
     * @param level The tree level.
     * @return The zero value.
     */
    function zeros(uint256 level) public pure returns (uint256) {
        if(level == 0) {
            return 0;
        } else if(level == 1) {
            return 14744269619966411208579211824598458697587494354926760081771325075741142829156;
        } else if (level == 2) {
            return 7423237065226347324353380772367382631490014989348495481811164164159255474657;
        } else if (level == 3) {
            return 11286972368698509976183087595462810875513684078608517520839298933882497716792;
        } else if (level == 4) {
            return 3607627140608796879659380071776844901612302623152076817094415224584923813162;
        } else if (level == 5) {
            return 19712377064642672829441595136074946683621277828620209496774504837737984048981;
        } else if (level == 6) {
            return 20775607673010627194014556968476266066927294572720319469184847051418138353016;
        } else if (level == 7) {
            return 3396914609616007258851405644437304192397291162432396347162513310381425243293;
        } else if (level == 8) {
            return 21551820661461729022865262380882070649935529853313286572328683688269863701601;
        } else if (level == 9) {
            return 6573136701248752079028194407151022595060682063033565181951145966236778420039;
        } else if (level == 10) {
            return 12413880268183407374852357075976609371175688755676981206018884971008854919922;
        } else if (level == 11) {
            return 14271763308400718165336499097156975241954733520325982997864342600795471836726;
        } else if (level == 12) {
            return 20066985985293572387227381049700832219069292839614107140851619262827735677018;
        } else if (level == 13) {
            return 9394776414966240069580838672673694685292165040808226440647796406499139370960;
        } else if (level == 14) {
            return 11331146992410411304059858900317123658895005918277453009197229807340014528524;
        } else if (level == 15) {
            return 15819538789928229930262697811477882737253464456578333862691129291651619515538;
        } else if (level == 16) {
            return 19217088683336594659449020493828377907203207941212636669271704950158751593251;
        } else if (level == 17) {
            return 21035245323335827719745544373081896983162834604456827698288649288827293579666;
        } else if (level == 18) {
            return 6939770416153240137322503476966641397417391950902474480970945462551409848591;
        } else if (level == 19) {
            return 10941962436777715901943463195175331263348098796018438960955633645115732864202;
        } else if (level == 20) {
            return 15019797232609675441998260052101280400536945603062888308240081994073687793470;
        } else if (level == 21) {
            return 11702828337982203149177882813338547876343922920234831094975924378932809409969;
        } else if (level == 22) {
            return 11217067736778784455593535811108456786943573747466706329920902520905755780395;
        } else if (level == 23) {
            return 16072238744996205792852194127671441602062027943016727953216607508365787157389;
        } else if (level == 24) {
            return 17681057402012993898104192736393849603097507831571622013521167331642182653248;
        } else if (level == 25) {
            return 21694045479371014653083846597424257852691458318143380497809004364947786214945;
        } else if (level == 26) {
            return 8163447297445169709687354538480474434591144168767135863541048304198280615192;
        } else if (level == 27) {
            return 14081762237856300239452543304351251708585712948734528663957353575674639038357;
        } else if (level == 28) {
            return 16619959921569409661790279042024627172199214148318086837362003702249041851090;
        } else if (level == 29) {
            return 7022159125197495734384997711896547675021391130223237843255817587255104160365;
        } else if (level == 30) {
            return 4114686047564160449611603615418567457008101555090703535405891656262658644463;
        } else if (level == 31) {
            return 12549363297364877722388257367377629555213421373705596078299904496781819142130;
        } else if (level == 32) {
            return 21443572485391568159800782191812935835534334817699172242223315142338162256601;
        } else {
            revert LevelIndexOutOfBounds();
        }
    }

}
